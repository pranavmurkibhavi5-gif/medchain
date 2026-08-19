/**
 * Vercel serverless entry point.
 *
 * Wraps the same Express app used by `npm start`. Vercel invokes this handler
 * per request instead of running a long-lived listener, so boot work (store
 * connection, bootstrap admin) is done once per cold start and cached on the
 * module scope.
 */
const app = require("../src/server.js");
const store = require("../src/config/store");
const config = require("../src/config");
const bcrypt = require("bcryptjs");

let ready = null;

async function boot() {
  await store.connect();
  const existing = await store.users.findByEmail(config.adminEmail);
  if (!existing) {
    const passwordHash = await bcrypt.hash(config.adminPassword, 10);
    await store.users.create({
      name: "System Administrator",
      email: config.adminEmail,
      passwordHash,
      role: "admin",
    });
  }
}

module.exports = async (req, res) => {
  // Reuse the same promise across invocations on a warm instance.
  if (!ready) ready = boot().catch((err) => {
    ready = null; // let the next request retry
    throw err;
  });
  await ready;
  return app(req, res);
};
