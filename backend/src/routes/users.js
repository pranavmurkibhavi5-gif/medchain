const express = require("express");
const { ethers } = require("ethers");
const store = require("../config/store");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

/** Directory view - never exposes password hashes or contact details. */
function directoryEntry(u) {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    walletAddress: u.walletAddress,
    encryptionPublicKey: u.encryptionPublicKey,
    specialization: u.specialization,
    hospital: u.hospital,
    licenseId: u.licenseId,
    verified: u.verified,
    // Blood group is medical data and now lives in the patient's encrypted
    // health profile, readable only by doctors they have approved. Serving it
    // here would hand it to every doctor who merely searches for a patient.
    createdAt: u.createdAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/doctors?q=  - patients browse doctors to grant access to
// ---------------------------------------------------------------------------
router.get("/doctors", requireAuth, async (req, res, next) => {
  try {
    const list = await store.users.search("doctor", req.query.q);
    res.json({ doctors: list.filter((d) => d.walletAddress).map(directoryEntry) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/patients?q=  - doctors search for a patient to request access
// ---------------------------------------------------------------------------
router.get("/patients", requireAuth, requireRole("doctor", "admin"), async (req, res, next) => {
  try {
    const list = await store.users.search("patient", req.query.q);
    res.json({ patients: list.filter((p) => p.walletAddress).map(directoryEntry) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/by-wallet/:address  - resolve an address to a display profile
// and, importantly, to the public key needed to seal a data key for them.
// ---------------------------------------------------------------------------
router.get("/by-wallet/:address", requireAuth, async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) return res.status(400).json({ error: "Invalid wallet address" });

    const user = await store.users.findByWallet(address);
    if (!user) return res.status(404).json({ error: "No registered user with that wallet" });
    res.json({ user: directoryEntry(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
