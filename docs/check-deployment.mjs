/**
 * Verifies a LIVE deployment end to end, without a browser.
 *
 *   node docs/check-deployment.mjs <API_URL> [FRONTEND_URL]
 *
 * Example:
 *   node docs/check-deployment.mjs https://medchain-api.onrender.com https://medchain.vercel.app
 *
 * Checks the API is awake, the contract is reachable on Sepolia, CORS is set
 * correctly for the frontend, and the deployed contract actually responds.
 */
import { ethers } from "ethers";

const API = (process.argv[2] || "").replace(/\/$/, "");
const SITE = (process.argv[3] || "").replace(/\/$/, "");

if (!API) {
  console.log("Usage: node docs/check-deployment.mjs <API_URL> [FRONTEND_URL]");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (m, extra = "") => { pass++; console.log(`  [ok]   ${m}${extra ? ` - ${extra}` : ""}`); };
const bad = (m, extra = "") => { fail++; console.log(`  [FAIL] ${m}${extra ? ` - ${extra}` : ""}`); };
const note = (m) => console.log(`         ${m}`);

async function main() {
  console.log(`\nChecking deployment`);
  console.log(`API  : ${API}`);
  if (SITE) console.log(`Site : ${SITE}`);
  console.log("-".repeat(50));

  // 1. API awake (Render free tier can take ~50s to wake)
  console.log("\n1. Backend");
  let health;
  try {
    const started = Date.now();
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(90000) });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    health = await res.json();
    if (res.ok && health.status === "ok") ok("API is awake", `${secs}s`);
    else bad("API responded but is not healthy", JSON.stringify(health).slice(0, 120));
    if (Number(secs) > 15) note("Slow first response is normal on Render free tier (cold start).");
  } catch (err) {
    bad("API unreachable", err.message);
    note("Open the API URL in a browser and wait for it to wake, then retry.");
    return finish();
  }

  // 2. Storage backends
  if (health.database === "mongodb") ok("MongoDB Atlas connected");
  else { ok("Using in-memory store"); note("Data resets whenever the service restarts. Set MONGODB_URI for persistence."); }

  if (health.ipfs === "pinata") ok("Pinata IPFS configured");
  else { ok("Using local content-addressed storage"); note("Set PINATA_JWT for real IPFS pinning."); }

  // 3. Chain wiring
  console.log("\n2. Blockchain");
  if (!health.contractAddress) {
    bad("CONTRACT_ADDRESS is not set on the backend");
    note("Add it in Render -> Environment, then redeploy.");
  } else {
    ok("Contract address configured", health.contractAddress);
  }

  if (Number(health.chainId) === 11155111) ok("Backend targets Sepolia");
  else bad(`Backend targets chain ${health.chainId}, expected 11155111 (Sepolia)`);

  if (health.chain?.connected) ok("RPC connected", `block ${health.chain.blockNumber}`);
  else bad("Backend cannot reach the RPC endpoint", health.chain?.reason || "");

  // 4. The contract really exists and answers
  if (health.contractAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(
        "https://ethereum-sepolia-rpc.publicnode.com", undefined, { staticNetwork: true }
      );
      const code = await provider.getCode(health.contractAddress);
      if (code && code !== "0x") ok("Contract bytecode present on Sepolia", `${(code.length / 2 - 1)} bytes`);
      else bad("No contract deployed at that address on Sepolia");

      const abi = ["function stats() view returns (uint256,uint256,uint256,uint256)"];
      const c = new ethers.Contract(health.contractAddress, abi, provider);
      const [p, d, r, q] = await c.stats();
      ok("Contract responds to calls", `${p} patients, ${d} doctors, ${r} records, ${q} requests`);
      note(`Explorer: https://sepolia.etherscan.io/address/${health.contractAddress}`);
    } catch (err) {
      bad("Could not query the contract", err.message.slice(0, 120));
    }
  }

  // 5. Auth surface responds
  console.log("\n3. API surface");
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
    });
    if (res.status === 401) ok("Auth endpoint rejects bad credentials correctly");
    else bad(`Auth endpoint returned ${res.status}, expected 401`);
  } catch (err) {
    bad("Auth endpoint unreachable", err.message);
  }

  try {
    const res = await fetch(`${API}/api/records/mine`);
    if (res.status === 401) ok("Protected routes require authentication");
    else bad(`Unauthenticated request returned ${res.status}, expected 401`);
  } catch (err) {
    bad("Could not test protected routes", err.message);
  }

  // 6. CORS
  if (SITE) {
    console.log("\n4. CORS and frontend");
    try {
      const res = await fetch(`${API}/api/health`, { headers: { Origin: SITE } });
      const allow = res.headers.get("access-control-allow-origin");
      if (allow === SITE || allow === "*") ok("CORS allows the frontend origin", allow);
      else bad(`CORS blocks ${SITE}`, `server allows: ${allow || "nothing"}`);
      if (allow === "*") note("Wildcard CORS works but set CORS_ORIGINS to your exact URL in production.");
    } catch (err) {
      bad("CORS check failed", err.message);
    }

    try {
      const res = await fetch(SITE, { signal: AbortSignal.timeout(30000) });
      const html = await res.text();
      if (res.ok && html.includes("<div id=\"root\">")) ok("Frontend is serving");
      else bad(`Frontend returned ${res.status}`);
    } catch (err) {
      bad("Frontend unreachable", err.message);
    }
  }

  finish();
}

function finish() {
  console.log("\n" + "=".repeat(50));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log("=".repeat(50));
  if (fail === 0) console.log("\nDeployment looks good. Open the site and try a full patient/doctor flow.\n");
  else console.log("\nSee DEPLOYMENT.md - the Troubleshooting section covers each failure above.\n");
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exitCode = 1;
});
