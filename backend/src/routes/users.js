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
    qualification: u.qualification || "",
    experienceYears: Number(u.experienceYears || 0),
    location: u.location || "",
    availability: u.availability || "",
    about: u.about || "",
    expertise: u.expertise || [],
    consultationFee: Number(u.consultationFee || 0),
    // The doctor's own payment address, which they chose to publish so
    // patients can pay them directly.
    upiId: u.upiId || "",
    hasPaymentQr: Boolean(u.paymentQr && u.paymentQr.data),
    // A flag, not the image: sending every avatar inline would make the
    // directory response enormous. The picture is fetched per user.
    hasAvatar: Boolean(u.avatar && u.avatar.data),
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
    const wanted = String(req.query.specialization || "").trim().toLowerCase();

    const doctors = list
      .filter((d) => d.walletAddress)
      .filter((d) => !wanted || String(d.specialization || "").toLowerCase() === wanted)
      .map(directoryEntry);

    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/specializations - the values actually in use, for the filter
// ---------------------------------------------------------------------------
router.get("/specializations", requireAuth, async (req, res, next) => {
  try {
    const list = await store.users.search("doctor", "");
    const counts = new Map();
    for (const d of list) {
      const spec = String(d.specialization || "").trim();
      if (!spec || !d.walletAddress) continue;
      counts.set(spec, (counts.get(spec) || 0) + 1);
    }
    res.json({
      specializations: [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
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

// ---------------------------------------------------------------------------
// Profile photo
//
// Stored in the database rather than on IPFS. An avatar must be readable by
// other users, so it cannot be encrypted the way a record is; and IPFS content
// is effectively permanent, which would make "remove photo" untrue. The image
// is resized in the browser before upload, so what arrives is small.
//
// Reading one still requires a signed-in account: this is a directory for
// users of the system, not a public image host.
// ---------------------------------------------------------------------------
const MAX_AVATAR_BYTES = 400 * 1024; // generous for a 256px JPEG
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

router.put("/avatar", requireAuth, async (req, res, next) => {
  try {
    const { data, type } = req.body || {};

    if (!data || typeof data !== "string") {
      return res.status(400).json({ error: "An image is required" });
    }
    if (!ALLOWED_AVATAR_TYPES.includes(String(type))) {
      return res.status(415).json({ error: "Use a JPEG, PNG or WebP image" });
    }
    // base64 inflates by about a third; measure the decoded size.
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_AVATAR_BYTES) {
      return res.status(413).json({ error: "That image is too large" });
    }

    await store.users.update(req.user.id, {
      avatar: { data, type, updatedAt: new Date().toISOString() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/avatar", requireAuth, async (req, res, next) => {
  try {
    await store.users.update(req.user.id, {
      avatar: { data: "", type: "", updatedAt: null },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** The image itself, by wallet address. Any signed-in user may fetch one. */
router.get("/avatar/:wallet", requireAuth, async (req, res, next) => {
  try {
    const user = await store.users.findByWallet(req.params.wallet);
    if (!user || !user.avatar || !user.avatar.data) {
      return res.status(404).json({ error: "No profile photo" });
    }

    const buf = Buffer.from(user.avatar.data, "base64");
    res.set("Content-Type", user.avatar.type || "image/jpeg");
    // Private: it belongs to a signed-in user, so no shared caches.
    res.set("Cache-Control", "private, max-age=300");
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Payment QR
//
// A doctor may upload the QR code their own bank issued rather than typing a
// UPI ID. Stored and served exactly like an avatar - it is meant to be shown
// to patients booking with them, and removing it must actually remove it.
// ---------------------------------------------------------------------------
router.put("/payment-qr", requireAuth, requireRole("doctor"), async (req, res, next) => {
  try {
    const { data, type } = req.body || {};
    if (!data || typeof data !== "string") {
      return res.status(400).json({ error: "An image is required" });
    }
    if (!ALLOWED_AVATAR_TYPES.includes(String(type))) {
      return res.status(415).json({ error: "Use a JPEG, PNG or WebP image" });
    }
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_AVATAR_BYTES) {
      return res.status(413).json({ error: "That image is too large" });
    }

    await store.users.update(req.user.id, {
      paymentQr: { data, type, updatedAt: new Date().toISOString() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/payment-qr", requireAuth, requireRole("doctor"), async (req, res, next) => {
  try {
    await store.users.update(req.user.id, {
      paymentQr: { data: "", type: "", updatedAt: null },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/payment-qr/:wallet", requireAuth, async (req, res, next) => {
  try {
    const user = await store.users.findByWallet(req.params.wallet);
    if (!user || !user.paymentQr || !user.paymentQr.data) {
      return res.status(404).json({ error: "No payment QR" });
    }
    res.set("Content-Type", user.paymentQr.type || "image/png");
    res.set("Cache-Control", "private, max-age=300");
    res.send(Buffer.from(user.paymentQr.data, "base64"));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
