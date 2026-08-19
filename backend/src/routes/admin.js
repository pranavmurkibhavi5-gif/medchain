const express = require("express");
const store = require("../config/store");
const chain = require("../services/chain");
const config = require("../config");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

function safeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------------------------------------------------------------------------
// GET /api/admin/overview
// ---------------------------------------------------------------------------
router.get("/overview", async (req, res, next) => {
  try {
    const [patients, doctors, admins, recordCount, logCount, onChain, health] = await Promise.all([
      store.users.count("patient"),
      store.users.count("doctor"),
      store.users.count("admin"),
      store.records.count(),
      store.logs.count(),
      chain.stats(),
      chain.health(),
    ]);

    res.json({
      offChain: { patients, doctors, admins, records: recordCount, auditEntries: logCount },
      onChain,
      network: health,
      storage: {
        database: store.getMode() === "mongo" ? "MongoDB Atlas" : "In-memory (demo)",
        ipfs: config.usingPinata ? "Pinata IPFS" : "Local content-addressed (demo)",
      },
      explorerBase: config.explorerBase,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/users?role=
// ---------------------------------------------------------------------------
router.get("/users", async (req, res, next) => {
  try {
    const filter = {};
    if (["patient", "doctor", "admin"].includes(req.query.role)) filter.role = req.query.role;
    const users = await store.users.list(filter);
    res.json({ users: users.map(safeUser) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id  - enable/disable or mark a doctor verified
// ---------------------------------------------------------------------------
router.patch("/users/:id", async (req, res, next) => {
  try {
    const patch = {};
    if (typeof req.body.active === "boolean") patch.active = req.body.active;
    if (typeof req.body.verified === "boolean") patch.verified = req.body.verified;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to update (active/verified expected)" });
    }

    const user = await store.users.update(req.params.id, patch);
    if (!user) return res.status(404).json({ error: "User not found" });

    await store.logs.add({
      action: "ADMIN_UPDATED_USER",
      actorRole: "admin",
      target: user.walletAddress,
      detail: `${user.email}: ${JSON.stringify(patch)}`,
      ip: req.ip,
    });

    res.json({ user: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/records
// ---------------------------------------------------------------------------
router.get("/records", async (req, res, next) => {
  try {
    const records = await store.records.listAll();
    // Metadata only. The admin can see that a record exists and verify its
    // hash, but has no key and therefore cannot read any medical content.
    res.json({
      records: records.map(({ wrappedKeys, ...r }) => ({
        ...r,
        sharedWithCount: (wrappedKeys || []).length,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/activity  - on-chain events (the immutable audit trail)
// ---------------------------------------------------------------------------
router.get("/activity", async (req, res, next) => {
  try {
    const events = await chain.recentEvents(Number(req.query.limit || 60));
    res.json({ events, contractConfigured: chain.isConfigured() });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/audit  - off-chain application log
// ---------------------------------------------------------------------------
router.get("/audit", async (req, res, next) => {
  try {
    const logs = await store.logs.list({ limit: Number(req.query.limit || 300) });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
