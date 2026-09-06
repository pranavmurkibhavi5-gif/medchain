/**
 * Doctor-patient messaging.
 *
 * Off-chain and encrypted. A conversation about symptoms is exactly the kind
 * of thing that must never go on a public ledger, so nothing here touches the
 * contract. The message body arrives already encrypted and sealed to the two
 * participants, so the server stores ciphertext it cannot read - the same
 * treatment a record gets.
 *
 * Messages disappear 24 hours after the recipient reads them. Unread messages
 * are kept indefinitely: a message that vanished before it was seen would be
 * worse than useless. There is one row per message, so expiry removes it for
 * both sides at once.
 *
 * This is a retention rule, not a security guarantee, and the app says so:
 * a recipient can photograph a screen, and nothing here can prevent that.
 */
const express = require("express");
const { ethers } = require("ethers");

const store = require("../config/store");
const { requireAuth, requireWallet } = require("../middleware/auth");

const router = express.Router();
const lc = (s) => (s || "").toLowerCase();

/** Visible for 24 hours from the moment it is read. */
const READ_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 8000; // ciphertext, so generous

/** A stable id for a pair, independent of who is asking. */
const threadKey = (a, b) => [lc(a), lc(b)].sort().join("|");

/**
 * Messaging is between a patient and a doctor. Two patients have no reason to
 * message each other through a medical records system, and allowing it would
 * turn the directory into a way to reach strangers.
 */
function pairIsAllowed(me, them) {
  if (!me || !them) return false;
  if (lc(me.walletAddress) === lc(them.walletAddress)) return false;
  const roles = [me.role, them.role].sort().join("+");
  return roles === "doctor+patient";
}

/**
 * POST /api/messages
 * Send one message. The body must already be encrypted.
 */
router.post("/", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const { toAddress, envelope, keys } = req.body || {};

    if (!toAddress || !ethers.isAddress(toAddress)) {
      return res.status(400).json({ error: "A valid recipient is required" });
    }
    if (!envelope || typeof envelope.ct !== "string" || typeof envelope.iv !== "string") {
      return res.status(400).json({ error: "The message must be encrypted before sending" });
    }
    if (envelope.ct.length > MAX_BODY) {
      return res.status(413).json({ error: "That message is too long" });
    }
    if (!Array.isArray(keys) || keys.length < 2) {
      return res.status(400).json({ error: "The message must be readable by both participants" });
    }

    const me = await store.users.findById(req.user.id);
    const them = await store.users.findByWallet(toAddress);
    if (!them) return res.status(404).json({ error: "That person could not be found" });
    if (!pairIsAllowed(me, them)) {
      return res.status(403).json({ error: "Messaging is between a patient and a doctor" });
    }

    const sealed = keys
      .filter((k) => k && k.forAddress && k.envelope)
      .map((k) => ({ forAddress: lc(k.forAddress), envelope: k.envelope }));

    const parties = [lc(me.walletAddress), lc(them.walletAddress)];
    if (!parties.every((p) => sealed.some((k) => k.forAddress === p))) {
      return res.status(400).json({ error: "The message must be sealed to both participants" });
    }

    const message = await store.messages.create({
      thread: threadKey(me.walletAddress, them.walletAddress),
      from: lc(me.walletAddress),
      to: lc(them.walletAddress),
      fromName: me.name || "",
      envelope,
      keys: sealed,
    });

    res.status(201).json({ message: { ...message, keys: undefined } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/threads
 * One row per conversation: who, when, and how many are still unread.
 */
router.get("/threads", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const me = lc(req.user.walletAddress);
    await store.messages.pruneExpired();

    const rows = await store.messages.listForUser(me);
    const byPerson = new Map();

    for (const m of rows) {
      const other = lc(m.from) === me ? lc(m.to) : lc(m.from);
      const entry = byPerson.get(other) || { address: other, unread: 0, lastAt: null, name: "" };
      if (!entry.lastAt || new Date(m.sentAt) > new Date(entry.lastAt)) entry.lastAt = m.sentAt;
      if (lc(m.to) === me && !m.readAt) entry.unread += 1;
      if (lc(m.from) !== me && m.fromName) entry.name = m.fromName;
      byPerson.set(other, entry);
    }

    // Fill in names and roles for the people we have talked to.
    const threads = [];
    for (const entry of byPerson.values()) {
      // eslint-disable-next-line no-await-in-loop
      const user = await store.users.findByWallet(entry.address);
      threads.push({
        ...entry,
        name: user?.name || entry.name || entry.address,
        role: user?.role || "",
        specialization: user?.specialization || "",
      });
    }

    threads.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    res.json({ threads });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/with/:wallet
 * One conversation. Reading it starts the 24-hour clock on anything addressed
 * to the reader that they had not seen before.
 */
router.get("/with/:wallet", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const me = lc(req.user.walletAddress);
    const other = lc(req.params.wallet);

    if (!ethers.isAddress(other)) {
      return res.status(400).json({ error: "A valid address is required" });
    }

    const mine = await store.users.findById(req.user.id);
    const them = await store.users.findByWallet(other);
    if (!them) return res.status(404).json({ error: "That person could not be found" });
    if (!pairIsAllowed(mine, them)) {
      return res.status(403).json({ error: "Messaging is between a patient and a doctor" });
    }

    await store.messages.pruneExpired();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + READ_LIFETIME_MS);
    // Start the clock only on messages sent TO the reader. A sender opening
    // their own thread should not make their message vanish unseen.
    await store.messages.markRead(threadKey(me, other), me, now, expiresAt);

    const rows = await store.messages.listThread(threadKey(me, other));

    const messages = rows.map((m) => {
      const sealed = (m.keys || []).find((k) => lc(k.forAddress) === me);
      const { keys, ...rest } = m;
      return { ...rest, sealed: sealed ? sealed.envelope : null };
    });

    res.json({
      messages,
      other: {
        address: other,
        name: them.name,
        role: them.role,
        specialization: them.specialization || "",
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/messages/:id
 * Either participant may remove a message early.
 */
router.delete("/:id", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const me = lc(req.user.walletAddress);
    const message = await store.messages.findById(req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (lc(message.from) !== me && lc(message.to) !== me) {
      return res.status(403).json({ error: "Not your message" });
    }
    await store.messages.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.READ_LIFETIME_MS = READ_LIFETIME_MS;
