/**
 * Starts a real MongoDB instance in-process and boots the API against it.
 *
 * Purpose: exercise the Mongoose code path in src/config/store.js exactly as it
 * will run against MongoDB Atlas, so a bug there is found here rather than in
 * production. Not part of the deployed app - a local verification harness.
 *
 *   npm run test:mongo
 */
const { MongoMemoryServer } = require("mongodb-memory-server");

async function main() {
  console.log("[mongo-test] starting MongoDB...");
  const mongod = await MongoMemoryServer.create({ instance: { dbName: "medchain" } });
  const uri = mongod.getUri("medchain");
  console.log(`[mongo-test] MongoDB ready at ${uri}`);

  // Configure before anything reads process.env.
  process.env.MONGODB_URI = uri;
  process.env.RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
  process.env.CHAIN_ID = process.env.CHAIN_ID || "31337";
  process.env.CONTRACT_ADDRESS =
    process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  process.env.PORT = process.env.PORT || "4000";
  process.env.CORS_ORIGINS = "*";

  const app = require("../backend/src/server.js");
  const store = require("../backend/src/config/store");
  const config = require("../backend/src/config");
  const bcrypt = require(require.resolve("bcryptjs", { paths: [require("path").join(__dirname, "..", "backend")] }));

  const mode = await store.connect();
  if (mode !== "mongo") {
    console.error(`[mongo-test] FAILED: store fell back to '${mode}' instead of mongo`);
    process.exit(1);
  }
  console.log("[mongo-test] store connected in MONGO mode");

  const existing = await store.users.findByEmail(config.adminEmail);
  if (!existing) {
    await store.users.create({
      name: "System Administrator",
      email: config.adminEmail,
      passwordHash: await bcrypt.hash(config.adminPassword, 10),
      role: "admin",
    });
    console.log("[mongo-test] bootstrap admin created");
  }

  app.listen(config.port, () => {
    console.log(`[mongo-test] API listening on http://localhost:${config.port} (MongoDB backed)`);
  });

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[mongo-test] fatal:", err);
  process.exit(1);
});
