/**
 * The patient's health profile: age, sex, blood group, allergies, conditions,
 * emergency contact.
 *
 * This is medical data, so it is handled exactly like a record and never like
 * an ordinary database field. The browser encrypts it with AES-256-GCM and
 * seals the data key to each recipient with ECIES; the server stores only the
 * ciphertext and those sealed envelopes, and can read none of it.
 *
 * A doctor must pass the same two gates a record demands:
 *   1. an on-chain permission from the patient, re-checked here so a client
 *      cannot simply claim access, and
 *   2. a key envelope sealed to their own public key.
 *
 * The contract has no notion of a "profile", so gate 1 is satisfied by the
 * doctor holding access to at least one of that patient's records - the same
 * consent the patient already granted through the normal request flow.
 */
const express = require("express");

const store = require("../config/store");
const chain = require("../services/chain");
const { requireAuth, requireRole, requireWallet } = require("../middleware/auth");

const router = express.Router();
const lc = (s) => (s || "").toLowerCase();

/** Does this doctor hold an on-chain permission for any record of this patient? */
async function hasAnyOnChainAccess(owner, viewer) {
  const records = await store.records.listByOwner(owner);
  for (const rec of records) {
    // eslint-disable-next-line no-await-in-loop
    if (await chain.hasAccess(owner, viewer, rec.recordId)) return true;
  }
  return false;
}

/**
 * PUT /api/health-profile
 * Replace the patient's profile and the full set of sealed keys.
 *
 * The whole set is replaced rather than merged: it is what makes revocation
 * immediate and total. Dropping a doctor from `wrappedKeys` removes their only
 * route to the key.
 */
router.put("/", requireAuth, requireRole("patient"), requireWallet, async (req, res, next) => {
  try {
    const { envelope, wrappedKeys } = req.body || {};

    if (!envelope || !envelope.ct || !envelope.iv) {
      return res.status(400).json({ error: "An encrypted profile is required" });
    }
    if (!Array.isArray(wrappedKeys) || wrappedKeys.length === 0) {
      return res.status(400).json({ error: "At least one sealed key is required" });
    }
    // Refuse anything that looks like plaintext: the server must not become a
    // place where health details can be read.
    if (typeof envelope.ct !== "string" || typeof envelope.iv !== "string") {
      return res.status(400).json({ error: "Profile must be encrypted before upload" });
    }

    const me = lc(req.user.walletAddress);
    const sealed = wrappedKeys
      .filter((k) => k && k.forAddress && k.envelope)
      .map((k) => ({ forAddress: lc(k.forAddress), envelope: k.envelope }));

    if (!sealed.some((k) => k.forAddress === me)) {
      return res.status(400).json({ error: "The profile must stay readable by you" });
    }

    const saved = await store.profiles.upsert(me, { envelope, wrappedKeys: sealed });

    await store.logs.add({
      action: "PROFILE_UPDATED",
      actor: me,
      actorRole: req.user.role,
      target: me,
      detail: `Health profile sealed to ${sealed.length} recipient(s)`,
      ip: req.ip,
    });

    res.json({ ok: true, updatedAt: saved.updatedAt, recipients: sealed.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health-profile/me
 * The patient's own profile, with the key sealed to their own wallet.
 */
router.get("/me", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const me = lc(req.user.walletAddress);
    const profile = await store.profiles.get(me);
    if (!profile) return res.json({ profile: null });

    const entry = (profile.wrappedKeys || []).find((k) => lc(k.forAddress) === me);
    if (!entry) return res.status(404).json({ error: "No sealed key stored for your wallet" });

    // The patient may see who their profile is currently sealed to - it is
    // their own sharing list. No key material is exposed.
    res.json({
      profile: { envelope: profile.envelope, updatedAt: profile.updatedAt },
      sealed: entry.envelope,
      recipients: (profile.wrappedKeys || [])
        .map((k) => lc(k.forAddress))
        .filter((a) => a !== me),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health-profile/:owner
 * A doctor reading an approved patient's profile. Both gates apply.
 */
router.get("/:owner", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const owner = lc(req.params.owner);
    const me = lc(req.user.walletAddress);

    if (owner === me) {
      const mine = await store.profiles.get(me);
      if (!mine) return res.json({ profile: null });
      const own = (mine.wrappedKeys || []).find((k) => lc(k.forAddress) === me);
      if (!own) return res.status(404).json({ error: "No sealed key stored for your wallet" });
      return res.json({
        profile: { envelope: mine.envelope, updatedAt: mine.updatedAt },
        sealed: own.envelope,
      });
    }

    if (!chain.isConfigured()) {
      return res.status(503).json({ error: "Blockchain not configured - cannot verify access" });
    }

    const profile = await store.profiles.get(owner);
    if (!profile) return res.json({ profile: null });

    const allowed = await hasAnyOnChainAccess(owner, me);
    if (!allowed) {
      await store.logs.add({
        action: "ACCESS_DENIED",
        actor: me,
        actorRole: req.user.role,
        target: owner,
        detail: "Health profile refused - no on-chain permission",
        ip: req.ip,
      });
      return res.status(403).json({ error: "Access denied by the smart contract" });
    }

    const entry = (profile.wrappedKeys || []).find((k) => lc(k.forAddress) === me);
    if (!entry) {
      return res.status(404).json({
        error:
          "The patient granted access on-chain but has not shared their profile key. Ask them to re-share.",
      });
    }

    await store.logs.add({
      action: "PROFILE_ACCESSED",
      actor: me,
      actorRole: req.user.role,
      target: owner,
      detail: "Health profile key released",
      ip: req.ip,
    });

    res.json({
      profile: { envelope: profile.envelope, updatedAt: profile.updatedAt },
      sealed: entry.envelope,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
