const express = require("express");
const bcrypt = require("bcryptjs");
const { ethers } = require("ethers");
const store = require("../config/store");
const { sign, requireAuth } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["patient", "doctor"];

function publicUser(u) {
  if (!u) return null;
  // The vault is ciphertext, but it is only ever needed by /api/wallet/vault,
  // so it is kept out of general responses.
  const { passwordHash, vault, ...rest } = u;
  return { ...rest, hasVault: Boolean(vault) };
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post("/register", async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role,
      dateOfBirth,
      bloodGroup,
      phone,
      specialization,
      licenseId,
      hospital,
    } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters" });
    }
    if (!EMAIL_RE.test(String(email || ""))) {
      return res.status(400).json({ error: "A valid email is required" });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Role must be 'patient' or 'doctor'" });
    }
    if (role === "doctor" && !licenseId) {
      return res.status(400).json({ error: "Medical licence ID is required for doctors" });
    }

    const existing = await store.users.findByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with that email already exists" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await store.users.create({
      name: String(name).trim(),
      email,
      passwordHash,
      role,
      dateOfBirth,
      bloodGroup,
      phone,
      specialization,
      licenseId,
      hospital,
    });

    await store.logs.add({
      action: "USER_REGISTERED",
      actorRole: role,
      detail: `${role} account created for ${user.email}`,
      ip: req.ip,
    });

    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await store.users.findByEmail(email);
    // Same message either way so the endpoint does not confirm which emails exist.
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.active) return res.status(403).json({ error: "This account has been disabled" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    await store.logs.add({
      action: "USER_LOGIN",
      actor: user.walletAddress,
      actorRole: user.role,
      detail: `${user.email} signed in`,
      ip: req.ip,
    });

    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/link-wallet
// Binds a MetaMask address to the account by verifying a signature, and stores
// the derived app public key used to seal record keys to this user.
// ---------------------------------------------------------------------------
router.post("/link-wallet", requireAuth, async (req, res, next) => {
  try {
    const { address, signature, message, encryptionPublicKey } = req.body || {};

    if (!ethers.isAddress(address || "")) {
      return res.status(400).json({ error: "A valid wallet address is required" });
    }
    if (!signature || !message) {
      return res.status(400).json({ error: "A signed message is required to prove wallet ownership" });
    }

    // Proof of ownership: the signature must recover to the claimed address.
    let recovered;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch {
      return res.status(400).json({ error: "Signature could not be verified" });
    }
    if (recovered.toLowerCase() !== String(address).toLowerCase()) {
      return res.status(401).json({ error: "Signature does not match the supplied address" });
    }

    // Bind the message to this account so a signature cannot be replayed elsewhere.
    if (!String(message).includes(req.user.id)) {
      return res.status(400).json({ error: "Signed message does not belong to this account" });
    }

    const owner = await store.users.findByWallet(address);
    if (owner && owner.id !== req.user.id) {
      return res.status(409).json({ error: "That wallet is already linked to another account" });
    }

    const updated = await store.users.update(req.user.id, {
      walletAddress: String(address).toLowerCase(),
      encryptionPublicKey: encryptionPublicKey || req.user.encryptionPublicKey || "",
    });

    await store.logs.add({
      action: "WALLET_LINKED",
      actor: address,
      actorRole: req.user.role,
      detail: `${req.user.email} linked wallet ${address}`,
      ip: req.ip,
    });

    res.json({ user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile
// ---------------------------------------------------------------------------
router.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const allowed = ["name", "dateOfBirth", "bloodGroup", "phone", "specialization", "hospital"];
    const patch = {};
    for (const key of allowed) {
      if (req.body && req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const updated = await store.users.update(req.user.id, patch);
    res.json({ user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
//
// The password does two jobs in this system: it authenticates the account and
// it derives the key that opens the user's wallet vault. Changing one without
// the other would leave them signed in but unable to decrypt a single record,
// so both move together, in one request.
//
// The browser opens the vault with the old password and re-seals it under the
// new one before calling this. The server therefore receives a new hash and an
// already re-sealed vault, and writes both or neither. It still never sees a
// password in the clear beyond the moment it verifies one.
// ---------------------------------------------------------------------------
const MIN_PASSWORD = 8;

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, vault, salt } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both the current and the new password are required" });
    }
    if (String(newPassword).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `The new password must be at least ${MIN_PASSWORD} characters` });
    }
    if (String(newPassword) === String(currentPassword)) {
      return res.status(400).json({ error: "The new password must be different" });
    }

    const user = await store.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const ok = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!ok) {
      await store.logs.add({
        action: "PASSWORD_CHANGE_FAILED",
        actor: user.walletAddress || "",
        actorRole: user.role,
        detail: "Wrong current password",
        ip: req.ip,
      });
      return res.status(401).json({ error: "That is not your current password" });
    }

    // An account with a vault MUST supply a re-sealed one. Refusing here is
    // what stops a caller locking themselves out of their own records.
    if (user.vault && (!vault || !vault.ct || !vault.iv || !salt)) {
      return res.status(400).json({
        error: "A re-sealed vault is required, otherwise your records would become unreadable",
      });
    }

    const patch = { passwordHash: await bcrypt.hash(String(newPassword), 10) };
    if (user.vault) {
      patch.vault = vault;
      patch.vaultSalt = salt;
    }

    await store.users.update(user.id, patch);

    await store.logs.add({
      action: "PASSWORD_CHANGED",
      actor: user.walletAddress || "",
      actorRole: user.role,
      detail: user.vault ? "Password changed and vault re-sealed" : "Password changed",
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
