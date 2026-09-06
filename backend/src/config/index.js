require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",

  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // Comma-separated list, or "*" during local development.
  corsOrigins: (process.env.CORS_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // MongoDB Atlas. Leave empty and the API falls back to an in-memory store so
  // the project runs with zero external setup for a demo.
  mongoUri: process.env.MONGODB_URI || "",

  // Blockchain (read-only; the backend never holds a user's private key)
  rpcUrl: process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  chainId: Number(process.env.CHAIN_ID || 11155111),
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  explorerBase: process.env.EXPLORER_BASE || "https://sepolia.etherscan.io",

  // IPFS via Pinata. Without a JWT the API stores encrypted blobs locally and
  // serves them back, so the full upload -> CID -> chain flow still works.
  pinataJwt: process.env.PINATA_JWT || "",
  pinataGateway: (process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud").replace(/\/$/, ""),
  publicGateway: (process.env.PUBLIC_IPFS_GATEWAY || "https://ipfs.io").replace(/\/$/, ""),

  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 15 * 1024 * 1024),

  // Bootstrap admin, created on first boot if it does not exist.
  adminEmail: process.env.ADMIN_EMAIL || "admin@bmr.local",

  // Outbound email, used only for security codes. Leaving SMTP_HOST unset
  // disables the feature cleanly rather than breaking password changes.
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "",
  },
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
};

config.usingMongo = Boolean(config.mongoUri);
config.usingPinata = Boolean(config.pinataJwt);

module.exports = config;
