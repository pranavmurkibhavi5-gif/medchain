/**
 * Blockchain-Based Secure Medical Record System - API server.
 *
 * Deployed to Render (or any Node host). It never sees plaintext medical data
 * and never holds a private key; it pins ciphertext to IPFS, mirrors on-chain
 * metadata, and enforces key release against the blockchain's own answer.
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");

const config = require("./config");
const store = require("./config/store");
const chain = require("./services/chain");
const ipfs = require("./services/ipfs");
const sponsor = require("./services/sponsor");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const recordRoutes = require("./routes/records");
const adminRoutes = require("./routes/admin");
const auditRoutes = require("./routes/audit");
const walletRoutes = require("./routes/wallet");
const healthProfileRoutes = require("./routes/health-profile");
const appointmentRoutes = require("./routes/appointments");
const messageRoutes = require("./routes/messages");

const app = express();
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

// Auth endpoints get a tighter limit than the rest of the API.
app.use(
  "/api/auth",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false })
);
app.use(
  "/api",
  rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

// ---------------------------------------------------------------------------
// Health / config discovery (the frontend reads this on boot)
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    name: "Blockchain-Based Secure Medical Record API",
    version: "1.0.0",
    status: "ok",
    docs: "/api/health",
  });
});

app.get("/api/health", async (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    database: store.getMode() === "mongo" ? "mongodb" : "memory",
    ipfs: config.usingPinata ? "pinata" : "local",
    pinata: await ipfs.pinataStatus(),
    sponsor: await sponsor.status(),
    chain: await chain.health(),
    contractAddress: config.contractAddress || null,
    chainId: config.chainId,
    explorerBase: config.explorerBase,
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    contractAddress: config.contractAddress || null,
    chainId: config.chainId,
    explorerBase: config.explorerBase,
    maxUploadBytes: config.maxUploadBytes,
    ipfsProvider: config.usingPinata ? "pinata" : "local",
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/health-profile", healthProfileRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/messages", messageRoutes);

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File is too large" });
  }
  console.error("[error]", err.stack || err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: config.nodeEnv === "production" && status === 500 ? "Internal server error" : err.message,
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function ensureAdmin() {
  const existing = await store.users.findByEmail(config.adminEmail);
  if (existing) return;
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await store.users.create({
    name: "System Administrator",
    email: config.adminEmail,
    passwordHash,
    role: "admin",
  });
  console.log(`[boot] bootstrap admin created: ${config.adminEmail}`);
}

async function start() {
  await store.connect();
  await ensureAdmin();

  app.listen(config.port, () => {
    console.log("");
    console.log("  Blockchain-Based Secure Medical Record - API");
    console.log("  --------------------------------------------");
    console.log(`  Listening   : http://localhost:${config.port}`);
    console.log(`  Environment : ${config.nodeEnv}`);
    console.log(`  Database    : ${store.getMode() === "mongo" ? "MongoDB Atlas" : "in-memory (demo)"}`);
    console.log(`  IPFS        : ${config.usingPinata ? "Pinata" : "local content-addressed (demo)"}`);
    console.log(`  Contract    : ${config.contractAddress || "not configured"}`);
    console.log(`  Chain ID    : ${config.chainId}`);
    console.log("");
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("[boot] fatal:", err);
    process.exit(1);
  });
}

module.exports = app;
