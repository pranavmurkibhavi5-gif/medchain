const express = require("express");
const store = require("../config/store");
const chain = require("../services/chain");
const config = require("../config");
const { requireAuth, requireWallet } = require("../middleware/auth");

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/audit/mine  - every logged action involving the caller's wallet
// ---------------------------------------------------------------------------
router.get("/mine", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const logs = await store.logs.listInvolving(req.user.walletAddress, Number(req.query.limit || 100));
    res.json({ logs, explorerBase: config.explorerBase });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/audit  - let the frontend record a client-side event (e.g. a local
// decryption) so the off-chain trail lines up with the on-chain one.
// ---------------------------------------------------------------------------
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const ALLOWED = [
      "RECORD_DECRYPTED",
      "RECORD_VIEWED",
      "ACCESS_REQUESTED",
      "ACCESS_GRANTED",
      "ACCESS_REJECTED",
      "ACCESS_REVOKED",
      "INTEGRITY_VERIFIED",
      "CHAIN_REGISTERED",
    ];
    const { action, target, recordId, txHash, detail } = req.body || {};
    if (!ALLOWED.includes(action)) return res.status(400).json({ error: "Unsupported audit action" });

    const entry = await store.logs.add({
      action,
      actor: req.user.walletAddress,
      actorRole: req.user.role,
      target,
      recordId,
      txHash,
      detail: String(detail || "").slice(0, 500),
      ip: req.ip,
    });
    res.status(201).json({ log: entry });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/audit/chain  - raw contract events, available to any signed-in user
// ---------------------------------------------------------------------------
router.get("/chain", requireAuth, async (req, res, next) => {
  try {
    const events = await chain.recentEvents(Number(req.query.limit || 40));
    res.json({ events, explorerBase: config.explorerBase });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
