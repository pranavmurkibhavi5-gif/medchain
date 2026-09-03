/**
 * Verifies the embedded-wallet flow end to end against a local stack:
 * register -> create vault in browser-equivalent code -> store vault ->
 * reopen with password -> sponsor gas -> send a real contract transaction.
 */
import { ethers } from "ethers";
import { createVault, openVault, makeSigner } from "../frontend/src/lib/wallet.js";

const B = process.env.API || "http://localhost:4000";
const RPC = process.env.RPC || "http://127.0.0.1:8545";
let pass = 0, fail = 0;
const ok = (m, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"}  ${m}${x ? " - " + x : ""}`); };

const call = async (p, o = {}) => {
  const h = {}; if (o.token) h.Authorization = `Bearer ${o.token}`;
  if (o.body) h["Content-Type"] = "application/json";
  const r = await fetch(`${B}${p}`, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  return { res: r, data: await r.json().catch(() => ({})) };
};

console.log("\nEmbedded wallet + gas sponsorship\n" + "=".repeat(40));

const PASSWORD = "PatientPass@2026";
const email = `w${Math.floor(Math.random() * 99999)}@t.local`;

// 1. register (no wallet involved)
let { data: reg } = await call("/api/auth/register", { method: "POST",
  body: { name: "Sudeep Kalkeri", email, password: PASSWORD, role: "patient" } });
ok("registered with email + password only", Boolean(reg.token));
ok("no wallet needed at signup", !reg.user.walletAddress);

// 2. create vault in the browser
const created = await createVault(PASSWORD);
ok("vault created with a real Ethereum key", ethers.isAddress(created.address), created.address);
ok("vault payload is ciphertext", !JSON.stringify(created.vault).includes(created.privateKey.slice(2, 20)));

// 3. store the sealed vault
const { res: vr } = await call("/api/wallet/vault", { method: "POST", token: reg.token,
  body: { vault: created.vault, salt: created.salt, address: created.address,
          encryptionPublicKey: created.keyPair.publicKey } });
ok("sealed vault stored on server", vr.status === 201);

// 4. server must not expose the key
const { data: me } = await call("/api/auth/me", { token: reg.token });
const meDump = JSON.stringify(me);
ok("server response contains no private key", !meDump.includes(created.privateKey));
ok("server response contains no vault ciphertext", !meDump.includes(created.vault.ct));

// 5. reopen with the password (simulates signing in on another device)
const { data: fetched } = await call("/api/wallet/vault", { token: reg.token });
const reopened = await openVault(PASSWORD, fetched.vault, fetched.salt);
ok("password reopens the same account", reopened.address === created.address);
ok("record-encryption key is stable", reopened.keyPair.publicKey === created.keyPair.publicKey);

// 6. wrong password must fail
let wrongRejected = false;
try { await openVault("WrongPassword123", fetched.vault, fetched.salt); }
catch (e) { wrongRejected = e.code === "WRONG_PASSWORD"; }
ok("wrong password is rejected", wrongRejected);

// 7. gas sponsorship
const { data: gas } = await call("/api/wallet/ensure-gas", { method: "POST", token: reg.token });
ok("gas sponsored so the user needs no faucet", gas.funded || gas.reason === "already_funded",
   gas.funded ? `${gas.amount} ETH` : gas.reason);

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const bal = await provider.getBalance(created.address);
ok("account now holds gas", bal > 0n, ethers.formatEther(bal) + " ETH");

// 8. send a REAL contract transaction with no MetaMask anywhere
const artifact = JSON.parse(await (await import("node:fs/promises")).readFile(
  new URL("../contracts/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json", import.meta.url), "utf8"));
const deployment = JSON.parse(await (await import("node:fs/promises")).readFile(
  new URL("../contracts/deployments/localhost.json", import.meta.url), "utf8"));

const signer = makeSigner(reopened.privateKey, RPC);
const contract = new ethers.Contract(deployment.address, artifact.abi, signer);
const tx = await contract.registerPatient("Sudeep Kalkeri", "");
const rc = await tx.wait();
ok("patient registered on-chain without MetaMask", rc.status === 1, `block ${rc.blockNumber}`);
ok("contract sees the embedded wallet as the patient", await contract.isPatient(created.address));

console.log("\n" + "=".repeat(40));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(40) + "\n");
process.exitCode = fail === 0 ? 0 : 1;
