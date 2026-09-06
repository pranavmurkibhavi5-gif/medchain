const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodeCrypto = require("node:crypto");
const { ethers } = require("ethers");
const config = require("../config");
const store = require("../config/store");
const mailer = require("../services/mailer");
const { sign, requireAuth } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["patient", "doctor"];

function publicUser(u) {
  if (!u) return null;
  // The vault is ciphertext, but it is only ever needed by /api/wallet/vault,
  // so it is kept out of general responses.
  // The avatar is base64 and would bloat every /me response, so only its
  // presence is reported; the image itself is fetched from its own endpoint.
  const { passwordHash, vault, avatar, recoveryVault, paymentQr, verifyCode, ...rest } = u;
  return {
    ...rest,
    hasVault: Boolean(vault),
    hasAvatar: Boolean(avatar && avatar.data),
    hasRecovery: Boolean(recoveryVault),
    hasPaymentQr: Boolean(paymentQr && paymentQr.data),
  };
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
    const allowed = [
      "name", "dateOfBirth", "bloodGroup", "phone",
      // Doctor directory details, self-declared.
      "specialization", "hospital", "qualification", "experienceYears",
      "location", "availability", "about", "expertise",
      "consultationFee", "upiId",
    ];
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

// A six-digit code, good for ten minutes, five attempts.
const CODE_TTL_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const mask = (email = "") => {
  const [name, domain] = String(email).split("@");
  if (!domain) return "";
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/**
 * POST /api/auth/change-password/request-code
 *
 * Emails a one-time code to the address on the account. The code is stored as
 * a bcrypt hash, so a database dump does not hand over live codes, and it is
 * never written to a log.
 *
 * The address is not taken from the request: it is read from the session, so
 * this cannot be used to send codes to somewhere the attacker controls.
 */
router.post("/change-password/request-code", requireAuth, async (req, res, next) => {
  try {
    if (!mailer.isConfigured()) {
      return res.status(503).json({ error: "Email verification is not available", available: false });
    }

    const user = await store.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const code = String(nodeCrypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await store.users.update(user.id, {
      verifyCode: {
        hash: await bcrypt.hash(code, 8),
        purpose: "change-password",
        expiresAt: expiresAt.toISOString(),
        attempts: 0,
      },
    });

    const result = await mailer.verificationCode({
      to: user.email,
      name: user.name,
      code,
      minutes: CODE_TTL_MINUTES,
    });

    if (!result.sent) {
      return res.status(502).json({ error: "The code could not be sent. Try again shortly." });
    }

    await store.logs.add({
      action: "VERIFY_CODE_SENT",
      actor: user.walletAddress || "",
      actorRole: user.role,
      detail: "Password change verification code sent",
      ip: req.ip,
    });

    // The masked address is returned so the screen can say where it went,
    // without echoing the full address back over the wire.
    res.json({ sent: true, sentTo: mask(user.email), expiresInMinutes: CODE_TTL_MINUTES });
  } catch (err) {
    next(err);
  }
});

/** Check and consume a pending code. Returns an error string, or "". */
async function consumeCode(user, code, purpose) {
  const pending = user.verifyCode || {};

  if (!pending.hash || pending.purpose !== purpose) {
    return "Request a verification code first";
  }
  if (!pending.expiresAt || new Date(pending.expiresAt).getTime() < Date.now()) {
    await store.users.update(user.id, { verifyCode: { hash: "", purpose: "", expiresAt: null, attempts: 0 } });
    return "That code has expired. Request a new one.";
  }
  if (Number(pending.attempts || 0) >= CODE_MAX_ATTEMPTS) {
    await store.users.update(user.id, { verifyCode: { hash: "", purpose: "", expiresAt: null, attempts: 0 } });
    return "Too many attempts. Request a new code.";
  }

  const ok = await bcrypt.compare(String(code || ""), pending.hash);
  if (!ok) {
    // Counting failures is what makes a six-digit code safe: without it,
    // a million guesses inside ten minutes is entirely feasible.
    await store.users.update(user.id, {
      verifyCode: { ...pending, attempts: Number(pending.attempts || 0) + 1 },
    });
    return "That code is not correct";
  }

  // Single use.
  await store.users.update(user.id, { verifyCode: { hash: "", purpose: "", expiresAt: null, attempts: 0 } });
  return "";
}

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

    // A second factor, when the server can actually send one. It is strictly
    // additional: the current password is still required, so a compromised
    // mailbox alone cannot take over an account.
    if (mailer.isConfigured()) {
      const problem = await consumeCode(user, req.body?.code, "change-password");
      if (problem) return res.status(401).json({ error: problem });
    }

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

// ---------------------------------------------------------------------------
// Account recovery
//
// The password derives the key to a user's records, so forgetting it would
// otherwise destroy them. A recovery code seals a second copy of the same
// wallet key; the server stores both sealed blobs and can open neither.
//
// The delicate part is authenticating a recovery attempt. The server cannot
// check the recovery code - it never sees it, which is the entire point - so
// a naive endpoint that simply accepted a new password would be an
// account-takeover route: anyone could lock a patient out of their own
// records.
//
// Instead the caller proves possession of the wallet key itself. The server
// issues a short-lived challenge, the client opens the recovery vault, signs
// the challenge with the key inside, and the server checks that the signature
// recovers to the address already on the account. Only someone holding the
// recovery code can produce that signature, and the code never leaves the
// device.
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/recovery
 * Store (or replace) the sealed recovery vault. Requires a live session.
 */
router.post("/recovery", requireAuth, async (req, res, next) => {
  try {
    const { vault, salt } = req.body || {};
    if (!vault || !vault.ct || !vault.iv || !salt) {
      return res.status(400).json({ error: "A sealed recovery vault is required" });
    }

    await store.users.update(req.user.id, {
      recoveryVault: vault,
      recoverySalt: salt,
      recoverySetAt: new Date().toISOString(),
    });

    await store.logs.add({
      action: "RECOVERY_KEY_SET",
      actor: req.user.walletAddress || "",
      actorRole: req.user.role,
      detail: "Recovery key created or replaced",
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/recover/start
 * Hand back the sealed recovery vault and a challenge to sign.
 *
 * This does reveal whether an email is registered. Returning nothing would
 * make recovery impossible, so the trade-off is accepted deliberately: an
 * attacker learns an address exists and receives ciphertext they cannot open.
 * The auth rate limiter applies here as it does to sign-in.
 */
router.post("/recover/start", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = email ? await store.users.findByEmail(email) : null;

    if (!user || !user.recoveryVault) {
      return res.status(404).json({ error: "No recovery key is set up for that account" });
    }
    if (!user.walletAddress) {
      return res.status(409).json({ error: "That account has no blockchain identity to verify" });
    }

    // Stateless and short-lived, so a restart cannot strand a recovery.
    const challenge = jwt.sign(
      { sub: String(user.id), purpose: "recover", nonce: nodeCrypto.randomUUID() },
      config.jwtSecret,
      { expiresIn: "10m" }
    );

    res.json({ vault: user.recoveryVault, salt: user.recoverySalt, challenge });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/recover/finish
 * Verify the signature, then set the new password and re-sealed vault together.
 */
router.post("/recover/finish", async (req, res, next) => {
  try {
    const { challenge, signature, newPassword, vault, salt } = req.body || {};

    if (!challenge || !signature) {
      return res.status(400).json({ error: "A signed challenge is required" });
    }
    if (!newPassword || String(newPassword).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `The new password must be at least ${MIN_PASSWORD} characters` });
    }
    if (!vault || !vault.ct || !vault.iv || !salt) {
      return res.status(400).json({
        error: "A re-sealed vault is required, otherwise your records would become unreadable",
      });
    }

    let claims;
    try {
      claims = jwt.verify(challenge, config.jwtSecret);
    } catch {
      return res.status(401).json({ error: "That recovery attempt has expired. Start again." });
    }
    if (claims.purpose !== "recover") {
      return res.status(401).json({ error: "Invalid challenge" });
    }

    const user = await store.users.findById(claims.sub);
    if (!user) return res.status(404).json({ error: "Account not found" });

    let signer;
    try {
      signer = ethers.verifyMessage(challenge, signature);
    } catch {
      return res.status(401).json({ error: "That signature could not be read" });
    }

    if (signer.toLowerCase() !== String(user.walletAddress).toLowerCase()) {
      await store.logs.add({
        action: "RECOVERY_FAILED",
        actor: signer.toLowerCase(),
        target: String(user.walletAddress).toLowerCase(),
        detail: "Recovery signature did not match the account",
        ip: req.ip,
      });
      return res.status(401).json({ error: "That recovery key does not belong to this account" });
    }

    await store.users.update(user.id, {
      passwordHash: await bcrypt.hash(String(newPassword), 10),
      vault,
      vaultSalt: salt,
    });

    await store.logs.add({
      action: "RECOVERY_COMPLETED",
      actor: String(user.walletAddress).toLowerCase(),
      actorRole: user.role,
      detail: "Password reset with a recovery key; vault re-sealed",
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
