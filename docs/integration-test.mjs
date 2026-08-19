/**
 * Full-stack end-to-end test.
 *
 * Drives the REAL backend, the REAL contract on a local chain and the REAL
 * browser crypto module, exercising the complete security flow and, most
 * importantly, proving that access control cannot be bypassed.
 *
 * Prerequisites (three terminals):
 *   1. cd contracts && npx hardhat node
 *   2. cd contracts && npx hardhat run scripts/deploy.js --network localhost
 *   3. cd backend  && CONTRACT_ADDRESS=<addr> RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 npm start
 *
 * Then: node docs/integration-test.mjs
 */
import { ethers } from "ethers";
import {
  encryptFile, decryptEnvelope, sealKey, unsealKey,
  deriveKeyPairFromSignature, KEY_DERIVATION_MESSAGE, keccakHex,
} from "../frontend/src/lib/crypto.js";
import artifact from "../contracts/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json" with { type: "json" };
import deployment from "../contracts/deployments/localhost.json" with { type: "json" };

const API = process.env.API || "http://localhost:4000";
const RPC = process.env.RPC || "http://127.0.0.1:8545";
const CONTRACT = deployment.address;

let pass = 0;
let fail = 0;

const ok = (label, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}${extra ? ` - ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${extra ? ` - ${extra}` : ""}`);
  }
};
const section = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

async function call(path, { method = "GET", token, body, isForm, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { res, buffer: new Uint8Array(await res.arrayBuffer()) };
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  return { res, data };
}

/** Register + link a wallet exactly the way the browser does. */
async function makeUser(role, name, wallet, extra = {}) {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, "")}${Date.now()}${Math.floor(Math.random() * 999)}@test.local`;
  const { data: reg } = await call("/api/auth/register", {
    method: "POST",
    body: { name, email, password: "Test@12345", role, ...extra },
  });
  if (!reg.token) throw new Error(`register failed: ${reg.error}`);

  const sig = await wallet.signMessage(KEY_DERIVATION_MESSAGE);
  const keyPair = deriveKeyPairFromSignature(sig);

  const msg = `MedChain wallet link\n\nAccount: ${reg.user.id}\nWallet: ${wallet.address}\nIssued: ${new Date().toISOString()}`;
  const linkSig = await wallet.signMessage(msg);
  const { data: linked } = await call("/api/auth/link-wallet", {
    method: "POST",
    token: reg.token,
    body: { address: wallet.address, signature: linkSig, message: msg, encryptionPublicKey: keyPair.publicKey },
  });
  if (!linked.user) throw new Error(`link-wallet failed: ${linked.error}`);

  return { token: reg.token, user: linked.user, wallet, keyPair, email };
}

async function main() {
  console.log("Blockchain-Based Secure Medical Record - full stack integration test");
  console.log(`API      : ${API}`);
  console.log(`Contract : ${CONTRACT}`);

  const provider = new ethers.JsonRpcProvider(RPC);

  // Fresh random wallets every run, funded from Hardhat account #0. This keeps
  // the test idempotent: a wallet may only ever be linked to one account, so
  // reusing fixed keys would (correctly) fail on the second run.
  const funder = new ethers.NonceManager(
    ethers.HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
      undefined,
      "m/44'/60'/0'/0/0"
    ).connect(provider)
  );

  const signers = [];
  for (let i = 0; i < 3; i++) {
    const w = ethers.Wallet.createRandom().connect(provider);
    await (await funder.sendTransaction({ to: w.address, value: ethers.parseEther("5") })).wait();
    // NonceManager keeps its own counter so back-to-back transactions from one
    // key cannot race; the browser does not need this because MetaMask
    // sequences transactions itself.
    const managed = new ethers.NonceManager(w);
    managed.address = w.address;
    signers.push(managed);
  }
  const [pSigner, dSigner, dSigner2] = signers;

  const asPatient = new ethers.Contract(CONTRACT, artifact.abi, pSigner);
  const asDoctor = new ethers.Contract(CONTRACT, artifact.abi, dSigner);
  const asDoctor2 = new ethers.Contract(CONTRACT, artifact.abi, dSigner2);

  // ------------------------------------------------------------- health
  section("0. Environment");
  const { data: health } = await call("/api/health");
  ok("API is up", health.status === "ok");
  ok("API is pointed at the contract", health.contractAddress?.toLowerCase() === CONTRACT.toLowerCase(),
    health.contractAddress || "not configured");
  ok("API sees the chain", health.chain?.connected === true, `block ${health.chain?.blockNumber}`);

  // -------------------------------------------------------- registration
  section("1. Registration (accounts + on-chain identity)");
  const patient = await makeUser("patient", "Rakesh Patil", pSigner, { bloodGroup: "O+" });
  const doctor = await makeUser("doctor", "Afziya Garag", dSigner, { specialization: "Cardiology", licenseId: "KA-MED-1042" });
  const rogue = await makeUser("doctor", "Rogue Doctor", dSigner2, { specialization: "General", licenseId: "XX-000" });
  ok("patient account created and wallet linked", patient.user.walletAddress === pSigner.address.toLowerCase());
  ok("doctor account created and wallet linked", doctor.user.walletAddress === dSigner.address.toLowerCase());
  ok("encryption public key registered", doctor.user.encryptionPublicKey?.startsWith("0x04"));

  await (await asPatient.registerPatient("Rakesh Patil", "")).wait();
  await (await asDoctor.registerDoctor("Dr. Afziya Garag", "Cardiology", "KA-MED-1042")).wait();
  await (await asDoctor2.registerDoctor("Dr. Rogue", "General", "XX-000")).wait();
  ok("patient registered on-chain", await asPatient.isPatient(pSigner.address));
  ok("doctor registered on-chain", await asPatient.isDoctor(dSigner.address));

  // ---------------------------------------------------------- upload flow
  section("2. Upload flow: validate -> encrypt -> IPFS -> hash -> chain");
  const content = new TextEncoder().encode(
    "PATIENT: Rakesh Patil\nDOB: 2004-03-11\nDIAGNOSIS: Stage 1 hypertension\nBP: 148/94\nPLAN: Amlodipine 5mg OD"
  );
  const file = {
    name: "blood-report.txt",
    type: "text/plain",
    size: content.length,
    arrayBuffer: async () => content.buffer,
  };

  const { envelope, dataKey, hash } = await encryptFile(file);
  ok("file encrypted into a BMR1 envelope", new TextDecoder().decode(envelope.subarray(0, 4)) === "BMR1");
  ok("ciphertext contains no plaintext", !new TextDecoder().decode(envelope).includes("hypertension"));

  const form = new FormData();
  form.append("file", new Blob([envelope]), "blood-report.txt.enc");
  const { data: up } = await call("/api/records/upload", { method: "POST", token: patient.token, body: form, isForm: true });
  ok("encrypted blob accepted and pinned", Boolean(up.cid), `CID ${up.cid}`);
  ok("server hash matches browser hash", up.dataHash?.toLowerCase() === hash.toLowerCase());

  const tx = await asPatient.uploadRecord(hash, up.cid, file.name, file.type, BigInt(file.size), "Lab Report");
  const rc = await tx.wait();
  const recordId = Number(
    rc.logs.map((l) => { try { return asPatient.interface.parseLog(l); } catch { return null; } })
      .find((p) => p?.name === "RecordUploaded").args.recordId
  );
  ok("record committed on-chain", recordId > 0, `record #${recordId}, block ${rc.blockNumber}`);

  const onChain = await asPatient.getRecord(recordId);
  ok("on-chain hash equals local hash", onChain.dataHash.toLowerCase() === hash.toLowerCase());
  ok("on-chain CID equals IPFS CID", onChain.cid === up.cid);
  const onChainDump = Array.from(onChain).map(String).join("|").toLowerCase();
  ok("medical content is NOT on-chain", !onChainDump.includes("hypertension") && !onChainDump.includes("148/94"));

  const ownerEnvelope = await sealKey(dataKey, patient.keyPair.publicKey);
  const { data: conf } = await call("/api/records/confirm", {
    method: "POST",
    token: patient.token,
    body: {
      recordId, cid: up.cid, dataHash: hash, fileName: file.name, fileType: file.type,
      fileSize: file.size, recordType: "Lab Report", txHash: rc.hash,
      blockNumber: rc.blockNumber, ownerEnvelope,
    },
  });
  ok("metadata + sealed owner key stored", Boolean(conf.record));

  // ------------------------------------------------------- patient reads
  section("3. Patient reads their own record");
  const { data: keyRes } = await call(`/api/records/${recordId}/key`, { token: patient.token });
  ok("patient receives their sealed key", Boolean(keyRes.envelope));
  const { buffer: blob } = await call(`/api/records/${recordId}/blob`, { token: patient.token, raw: true });
  ok("downloaded blob matches on-chain hash", keccakHex(blob).toLowerCase() === hash.toLowerCase());
  const recoveredKey = await unsealKey(keyRes.envelope, patient.keyPair.privateKey);
  const { blob: plain } = await decryptEnvelope(blob, recoveredKey);
  const text = await plain.text();
  ok("patient decrypts the original content", text.includes("Stage 1 hypertension"));

  // ------------------------------------------- unauthorised doctor blocked
  section("4. Unauthorised doctor is blocked (the critical test)");
  const { res: r1, data: d1 } = await call(`/api/records/${recordId}/key`, { token: doctor.token });
  ok("API refuses the key without an on-chain grant", r1.status === 403, d1.error);

  const { res: r2 } = await call(`/api/records/${recordId}/blob`, { token: doctor.token, raw: true });
  ok("API refuses the ciphertext too", r2.status === 403);

  const { res: r3, data: d3 } = await call(`/api/records/patient/${pSigner.address}`, { token: doctor.token });
  ok("API refuses to list the patient's records", r3.status === 403, d3.error);

  let reverted = false;
  try { await asDoctor.getPatientRecordsAsDoctor(pSigner.address); } catch { reverted = true; }
  ok("contract itself reverts the doctor's read", reverted);
  ok("contract reports no access", (await asPatient.canAccessRecord(recordId, dSigner.address)) === false);

  const denyRc = await (await asDoctor.logRecordAccess(recordId)).wait();
  const denied = denyRc.logs.some((l) => {
    try { return asDoctor.interface.parseLog(l)?.name === "AccessDenied"; } catch { return false; }
  });
  ok("denied attempt emits AccessDenied on-chain", denied);

  // --------------------------------------------------- request + approve
  section("5. Request -> approve -> doctor reads");
  const reqRc = await (await asDoctor.requestAccess(pSigner.address, 0, "Cardiac review")).wait();
  const requestId = Number(
    reqRc.logs.map((l) => { try { return asDoctor.interface.parseLog(l); } catch { return null; } })
      .find((p) => p?.name === "AccessRequested").args.requestId
  );
  ok("doctor raised an on-chain request", requestId > 0, `request #${requestId}`);
  ok("request is Pending", Number((await asPatient.getRequest(requestId)).status) === 1);

  await (await asPatient.approveRequest(requestId)).wait();
  ok("request is Approved", Number((await asPatient.getRequest(requestId)).status) === 2);
  ok("contract now grants access", await asPatient.hasAccess(pSigner.address, dSigner.address, recordId));

  // Patient re-seals the data key for the doctor.
  const sealedForDoctor = await sealKey(recoveredKey, doctor.user.encryptionPublicKey);
  const { data: share } = await call(`/api/records/${recordId}/share`, {
    method: "POST", token: patient.token,
    body: { doctorAddress: dSigner.address, envelope: sealedForDoctor },
  });
  ok("patient shared the sealed key", Boolean(share.record));

  const { res: r4, data: dk } = await call(`/api/records/${recordId}/key`, { token: doctor.token });
  ok("API now releases the key to the doctor", r4.status === 200 && Boolean(dk.envelope));
  const { buffer: dblob } = await call(`/api/records/${recordId}/blob`, { token: doctor.token, raw: true });
  ok("doctor's blob passes the integrity check", keccakHex(dblob).toLowerCase() === hash.toLowerCase());

  const docKey = await unsealKey(dk.envelope, doctor.keyPair.privateKey);
  const { blob: docPlain } = await decryptEnvelope(dblob, docKey);
  ok("doctor decrypts the record", (await docPlain.text()).includes("Stage 1 hypertension"));

  const viewRc = await (await asDoctor.logRecordAccess(recordId)).wait();
  ok("authorised read emits RecordViewed", viewRc.logs.some((l) => {
    try { return asDoctor.interface.parseLog(l)?.name === "RecordViewed"; } catch { return false; }
  }));

  // ------------------------------------------------------------- revoke
  section("6. Revocation immediately cuts off access");
  await (await asPatient.revokeAccess(dSigner.address, 0)).wait();
  ok("contract no longer grants access", (await asPatient.canAccessRecord(recordId, dSigner.address)) === false);
  ok("approved request flipped to Revoked", Number((await asPatient.getRequest(requestId)).status) === 4);

  await call("/api/records/revoke-keys", {
    method: "POST", token: patient.token, body: { doctorAddress: dSigner.address },
  });

  const { res: r5, data: d5 } = await call(`/api/records/${recordId}/key`, { token: doctor.token });
  ok("API refuses the key after revocation", r5.status === 403, d5.error);
  const { res: r6 } = await call(`/api/records/${recordId}/blob`, { token: doctor.token, raw: true });
  ok("API refuses the ciphertext after revocation", r6.status === 403);

  let reverted2 = false;
  try { await asDoctor.getPatientRecordsAsDoctor(pSigner.address); } catch { reverted2 = true; }
  ok("contract reverts the doctor again", reverted2);

  // --------------------------------------------------- crypto guarantees
  section("7. Cryptographic guarantees");
  let stolen = false;
  try { await unsealKey(sealedForDoctor, rogue.keyPair.privateKey); stolen = true; } catch { /* expected */ }
  ok("a different doctor cannot unseal a stolen envelope", !stolen);

  const tampered = Uint8Array.from(blob);
  tampered[tampered.length - 3] ^= 0xff;
  ok("tampering changes the hash", keccakHex(tampered).toLowerCase() !== hash.toLowerCase());
  ok("contract detects the tampered hash",
    (await asPatient.verifyRecordIntegrity(recordId, keccakHex(tampered))) === false);
  ok("contract confirms the genuine hash",
    (await asPatient.verifyRecordIntegrity(recordId, hash)) === true);

  let decrypted = false;
  try { await decryptEnvelope(tampered, dataKey); decrypted = true; } catch { /* expected */ }
  ok("AES-GCM rejects the tampered ciphertext", !decrypted);

  const { res: r7, data: d7 } = await call("/api/records/upload", {
    method: "POST", token: patient.token, isForm: true,
    body: (() => { const f = new FormData(); f.append("file", new Blob([content]), "plain.txt"); return f; })(),
  });
  ok("API refuses to store unencrypted plaintext", r7.status === 400, d7.error);

  // ------------------------------------------------------------- admin
  section("8. Admin visibility without readability");
  const { data: adminLogin } = await call("/api/auth/login", {
    method: "POST", body: { email: "admin@bmr.local", password: "Admin@12345" },
  });
  ok("admin can sign in", Boolean(adminLogin.token));

  const { data: ov } = await call("/api/admin/overview", { token: adminLogin.token });
  ok("admin sees platform stats", ov.offChain?.records >= 1, `${ov.offChain?.patients} patients, ${ov.offChain?.records} records`);
  ok("admin reads on-chain totals", ov.onChain?.records >= 1);

  const { data: ar } = await call("/api/admin/records", { token: adminLogin.token });
  const adminRecord = ar.records?.find((r) => r.recordId === recordId);
  ok("admin sees record metadata", Boolean(adminRecord));
  ok("admin response carries no key material", !JSON.stringify(ar).includes("wrappedKeys"));

  const { res: r8 } = await call(`/api/records/${recordId}/key`, { token: adminLogin.token });
  ok("admin cannot fetch a decryption key", r8.status !== 200, `status ${r8.status}`);

  const { data: act } = await call("/api/admin/activity", { token: adminLogin.token });
  ok("admin reads the on-chain event trail", (act.events?.length || 0) > 0, `${act.events?.length} events`);
  const kinds = new Set((act.events || []).map((e) => e.event));
  ok("audit trail contains AccessDenied", kinds.has("AccessDenied"));
  ok("audit trail contains AccessGranted", kinds.has("AccessGranted"));
  ok("audit trail contains AccessRevoked", kinds.has("AccessRevoked"));

  // ------------------------------------------------------------- result
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log("=".repeat(60));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
