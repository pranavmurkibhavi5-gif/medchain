/**
 * Embedded-wallet endpoints.
 *
 * The server stores the user's encrypted vault and hands it back on sign-in.
 * It never sees the password or any private key: the vault is opened in the
 * browser. These routes are deliberately thin - the security lives in the
 * client-side KDF and in the contract, not here.
 */
const express = require("express");
const { ethers } = require("ethers");

const store = require("../config/store");
const sponsor = require("../services/sponsor");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/wallet/vault
 * Store the encrypted vault created at registration. One-time per account
 * unless the user is deliberately re-sealing after a password change.
 */
router.post("/vault", requireAuth, async (req, res, next) => {
  try {
    const { vault, salt, address, encryptionPublicKey, replace } = req.body || {};

    if (!vault || !vault.ct || !vault.iv) {
      return res.status(400).json({ error: "A sealed vault is required" });
    }
    if (!salt) return res.status(400).json({ error: "A key derivation salt is required" });
    if (!ethers.isAddress(address || "")) {
      return res.status(400).json({ error: "A valid blockchain address is required" });
    }

    if (req.user.vault && !replace) {
      return res.status(409).json({ error: "This account already has a vault" });
    }

    // The address is claimed, not proved, because the browser cannot sign
    // before the vault exists. It is only ever used for this same account, and
    // the contract still checks msg.sender, so a wrong value can at worst
    // break the claimant's own account.
    const owner = await store.users.findByWallet(address);
    if (owner && owner.id !== req.user.id) {
      return res.status(409).json({ error: "That blockchain account is already in use" });
    }

    const updated = await store.users.update(req.user.id, {
      vault,
      vaultSalt: salt,
      walletAddress: String(address).toLowerCase(),
      encryptionPublicKey: encryptionPublicKey || "",
    });

    await store.logs.add({
      action: "WALLET_LINKED",
      actor: address,
      actorRole: req.user.role,
      detail: `${req.user.email} created an in-app secure account`,
      ip: req.ip,
    });

    const { passwordHash, vault: _v, ...safe } = updated;
    res.status(201).json({ user: safe });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/wallet/vault
 * Return the sealed vault so the browser can open it with the password.
 * Useless without the password - it is ciphertext.
 */
router.get("/vault", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.vault) {
      return res.status(404).json({ error: "No vault set up for this account" });
    }
    res.json({
      vault: req.user.vault,
      salt: req.user.vaultSalt,
      address: req.user.walletAddress,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/wallet/ensure-gas
 * Top the user's account up so they can send their own transactions without
 * ever seeing a faucet. Safe to call repeatedly - it no-ops when funded.
 */
router.post("/ensure-gas", requireAuth, async (req, res, next) => {
  try {
    if (!req.user.walletAddress) {
      return res.status(400).json({ error: "Finish setting up your account first" });
    }
    const result = await sponsor.topUp(req.user.walletAddress);
    if (result.funded) {
      await store.logs.add({
        action: "GAS_SPONSORED",
        actor: req.user.walletAddress,
        actorRole: req.user.role,
        txHash: result.txHash || "",
        detail: `Sponsored ${result.amount} ETH for transaction fees`,
        ip: req.ip,
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/wallet/sponsor - visibility for the admin console. */
router.get("/sponsor", requireAuth, async (req, res, next) => {
  try {
    res.json(await sponsor.status());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
