/**
 * Record routes.
 *
 * Everything here handles ciphertext and sealed key envelopes only. The server
 * cannot decrypt a record: it has no data key and no user private key. Its job
 * is to (a) pin encrypted bytes to IPFS, (b) mirror on-chain metadata for fast
 * listing, and (c) release a sealed key envelope ONLY after re-checking the
 * permission on the blockchain itself.
 */
const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const { ethers } = require("ethers");

const config = require("../config");
const store = require("../config/store");
const ipfs = require("../services/ipfs");
const chain = require("../services/chain");
const { requireAuth, requireRole, requireWallet } = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

const lc = (s) => String(s || "").toLowerCase();

/** keccak256 of the encrypted bytes - identical to what the contract stores. */
function keccakHex(buffer) {
  return ethers.keccak256(new Uint8Array(buffer));
}

// ---------------------------------------------------------------------------
// POST /api/records/upload   (patient, multipart: file = ENCRYPTED blob)
// Returns the CID + hash the client then commits to the blockchain.
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  requireAuth,
  requireRole("patient"),
  requireWallet,
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: "No encrypted file received" });
      }
      // Guard against a client accidentally sending plaintext: the frontend
      // always prefixes the envelope with this magic header.
      const magic = req.file.buffer.subarray(0, 4).toString("utf8");
      if (magic !== "BMR1") {
        return res.status(400).json({
          error: "Payload is not a valid BMR encrypted envelope - refusing to store plaintext",
        });
      }

      const dataHash = keccakHex(req.file.buffer);
      const { cid, provider, size, gatewayUrl } = await ipfs.upload(
        req.file.buffer,
        req.file.originalname || "record.enc"
      );

      await store.logs.add({
        action: "IPFS_UPLOAD",
        actor: req.user.walletAddress,
        actorRole: "patient",
        detail: `Encrypted blob pinned via ${provider} (${size} bytes) -> ${cid}`,
        ip: req.ip,
      });

      res.status(201).json({ cid, dataHash, size, provider, gatewayUrl });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/records/confirm   (patient)
// Called after the uploadRecord() transaction is mined. Mirrors the on-chain
// metadata and stores the data key sealed to the patient's own app key.
// ---------------------------------------------------------------------------
router.post("/confirm", requireAuth, requireRole("patient"), requireWallet, async (req, res, next) => {
  try {
    const {
      recordId,
      cid,
      dataHash,
      fileName,
      fileType,
      fileSize,
      recordType,
      notes,
      txHash,
      blockNumber,
      ownerEnvelope,
    } = req.body || {};

    if (!recordId || Number(recordId) <= 0) {
      return res.status(400).json({ error: "A confirmed on-chain recordId is required" });
    }
    if (!cid || !dataHash) return res.status(400).json({ error: "cid and dataHash are required" });
    if (!ownerEnvelope) return res.status(400).json({ error: "ownerEnvelope (sealed data key) is required" });

    // Trust the chain, not the client: the record must exist on-chain and be
    // owned by the caller's wallet, with a matching hash.
    if (chain.isConfigured()) {
      const onChain = await chain.getRecord(recordId);
      if (!onChain) return res.status(400).json({ error: "That record id does not exist on chain yet" });
      if (lc(onChain.owner) !== lc(req.user.walletAddress)) {
        return res.status(403).json({ error: "That on-chain record belongs to a different wallet" });
      }
      if (lc(onChain.dataHash) !== lc(dataHash) || onChain.cid !== cid) {
        return res.status(400).json({ error: "Submitted hash/CID does not match the on-chain record" });
      }
    }

    const existing = await store.records.findByRecordId(recordId);
    if (existing) return res.json({ record: existing, alreadyRecorded: true });

    const record = await store.records.create({
      recordId: Number(recordId),
      owner: req.user.walletAddress,
      cid,
      dataHash,
      fileName,
      fileType,
      fileSize,
      recordType,
      notes,
      txHash,
      blockNumber,
      wrappedKeys: [
        {
          forAddress: lc(req.user.walletAddress),
          envelope: ownerEnvelope,
          grantedAt: new Date().toISOString(),
        },
      ],
    });

    await store.logs.add({
      action: "RECORD_UPLOADED",
      actor: req.user.walletAddress,
      actorRole: "patient",
      recordId: Number(recordId),
      txHash: txHash || "",
      detail: `Record #${recordId} (${recordType || "Other"}) committed to blockchain`,
      ip: req.ip,
    });

    res.status(201).json({ record });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/records/mine   (patient)
// ---------------------------------------------------------------------------
router.get("/mine", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const records = await store.records.listByOwner(req.user.walletAddress);
    res.json({ records: records.map(stripEnvelopes) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/records/patient/:wallet   (doctor, gated on-chain)
// ---------------------------------------------------------------------------
router.get(
  "/patient/:wallet",
  requireAuth,
  requireRole("doctor", "patient"),
  requireWallet,
  async (req, res, next) => {
    try {
      const patient = req.params.wallet;
      if (!ethers.isAddress(patient)) return res.status(400).json({ error: "Invalid patient address" });

      if (lc(patient) !== lc(req.user.walletAddress)) {
        const allowed = await chain.hasAccess(patient, req.user.walletAddress, 0);
        if (!allowed) {
          await store.logs.add({
            action: "ACCESS_DENIED",
            actor: req.user.walletAddress,
            actorRole: req.user.role,
            target: patient,
            detail: "Attempted to list records without an on-chain grant",
            ip: req.ip,
          });
          return res.status(403).json({ error: "Access denied - the patient has not granted you access" });
        }
      }

      const records = await store.records.listByOwner(patient);
      res.json({ records: records.map(stripEnvelopes) });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/records/:recordId/key
// Releases the sealed data key for the caller - ONLY if the blockchain says so.
// ---------------------------------------------------------------------------
router.get("/:recordId/key", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const recordId = Number(req.params.recordId);
    const record = await store.records.findByRecordId(recordId);
    if (!record) return res.status(404).json({ error: "Record not found" });

    const me = lc(req.user.walletAddress);
    const isOwner = me === lc(record.owner);

    if (!isOwner) {
      if (!chain.isConfigured()) {
        return res.status(503).json({ error: "Blockchain not configured - cannot verify access" });
      }
      const allowed = await chain.hasAccess(record.owner, me, recordId);
      if (!allowed) {
        await store.logs.add({
          action: "ACCESS_DENIED",
          actor: me,
          actorRole: req.user.role,
          target: record.owner,
          recordId,
          detail: `Key request for record #${recordId} refused - no on-chain permission`,
          ip: req.ip,
        });
        return res.status(403).json({ error: "Access denied by the smart contract" });
      }
    }

    const entry = (record.wrappedKeys || []).find((k) => lc(k.forAddress) === me);
    if (!entry) {
      return res.status(404).json({
        error: isOwner
          ? "No sealed key stored for your wallet on this record"
          : "The patient granted access on-chain but has not yet shared the decryption key. Ask them to re-share.",
      });
    }

    if (!isOwner) {
      await store.logs.add({
        action: "RECORD_ACCESSED",
        actor: me,
        actorRole: req.user.role,
        target: record.owner,
        recordId,
        detail: `Decryption key released for record #${recordId}`,
        ip: req.ip,
      });
    }

    res.json({ envelope: entry.envelope, cid: record.cid, dataHash: record.dataHash });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/records/:recordId/blob
// Streams the ENCRYPTED bytes back. Also gated, and integrity-checked.
// ---------------------------------------------------------------------------
router.get("/:recordId/blob", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const recordId = Number(req.params.recordId);
    const record = await store.records.findByRecordId(recordId);
    if (!record) return res.status(404).json({ error: "Record not found" });

    const me = lc(req.user.walletAddress);
    if (me !== lc(record.owner)) {
      const allowed = chain.isConfigured()
        ? await chain.hasAccess(record.owner, me, recordId)
        : false;
      if (!allowed) return res.status(403).json({ error: "Access denied by the smart contract" });
    }

    const buffer = await ipfs.fetchBlob(record.cid);
    const actualHash = keccakHex(buffer);
    const intact = lc(actualHash) === lc(record.dataHash);

    if (!intact) {
      await store.logs.add({
        action: "INTEGRITY_FAILURE",
        actor: me,
        target: record.owner,
        recordId,
        detail: `Hash mismatch for record #${recordId}: expected ${record.dataHash}, got ${actualHash}`,
        ip: req.ip,
      });
      return res.status(409).json({
        error: "Integrity check failed - the stored file does not match the on-chain hash",
        expected: record.dataHash,
        actual: actualHash,
      });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-BMR-Data-Hash", actualHash);
    res.setHeader("X-BMR-Integrity", "verified");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/records/:recordId/share   (patient)
// Stores the data key re-sealed for a doctor's app public key.
// ---------------------------------------------------------------------------
router.post(
  "/:recordId/share",
  requireAuth,
  requireRole("patient"),
  requireWallet,
  async (req, res, next) => {
    try {
      const recordId = Number(req.params.recordId);
      const { doctorAddress, envelope } = req.body || {};

      if (!ethers.isAddress(doctorAddress || "")) {
        return res.status(400).json({ error: "A valid doctor wallet address is required" });
      }
      if (!envelope) return res.status(400).json({ error: "A sealed key envelope is required" });

      const record = await store.records.findByRecordId(recordId);
      if (!record) return res.status(404).json({ error: "Record not found" });
      if (lc(record.owner) !== lc(req.user.walletAddress)) {
        return res.status(403).json({ error: "Only the record owner can share it" });
      }

      const updated = await store.records.putWrappedKey(recordId, doctorAddress, envelope);

      await store.logs.add({
        action: "KEY_SHARED",
        actor: req.user.walletAddress,
        actorRole: "patient",
        target: doctorAddress,
        recordId,
        detail: `Decryption key for record #${recordId} sealed for ${doctorAddress}`,
        ip: req.ip,
      });

      res.json({ record: stripEnvelopes(updated) });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/records/revoke-keys   (patient)
// Companion to the on-chain revoke: removes every sealed key for that doctor.
// ---------------------------------------------------------------------------
router.post("/revoke-keys", requireAuth, requireRole("patient"), requireWallet, async (req, res, next) => {
  try {
    const { doctorAddress, recordId } = req.body || {};
    if (!ethers.isAddress(doctorAddress || "")) {
      return res.status(400).json({ error: "A valid doctor wallet address is required" });
    }

    if (recordId && Number(recordId) > 0) {
      const record = await store.records.findByRecordId(recordId);
      if (!record || lc(record.owner) !== lc(req.user.walletAddress)) {
        return res.status(403).json({ error: "Only the record owner can revoke access" });
      }
      await store.records.removeWrappedKey(Number(recordId), doctorAddress);
    } else {
      await store.records.removeWrappedKeysForOwner(req.user.walletAddress, doctorAddress);
    }

    await store.logs.add({
      action: "ACCESS_REVOKED",
      actor: req.user.walletAddress,
      actorRole: "patient",
      target: doctorAddress,
      recordId: Number(recordId || 0),
      detail: recordId
        ? `Keys revoked for record #${recordId}`
        : "All decryption keys revoked for this doctor",
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/records/:recordId/shared-with   (patient)
// ---------------------------------------------------------------------------
router.get(
  "/:recordId/shared-with",
  requireAuth,
  requireRole("patient"),
  requireWallet,
  async (req, res, next) => {
    try {
      const record = await store.records.findByRecordId(Number(req.params.recordId));
      if (!record) return res.status(404).json({ error: "Record not found" });
      if (lc(record.owner) !== lc(req.user.walletAddress)) {
        return res.status(403).json({ error: "Not your record" });
      }
      const me = lc(req.user.walletAddress);
      const addresses = (record.wrappedKeys || [])
        .map((k) => k.forAddress)
        .filter((a) => lc(a) !== me);
      res.json({ addresses });
    } catch (err) {
      next(err);
    }
  }
);

/** Never leak sealed envelopes in list responses - they are fetched one by one. */
function stripEnvelopes(record) {
  if (!record) return record;
  const { wrappedKeys, ...rest } = record;
  return { ...rest, sharedWith: (wrappedKeys || []).map((k) => k.forAddress) };
}

module.exports = router;
