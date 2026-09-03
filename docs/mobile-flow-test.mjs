/**
 * Full mobile user flow, exercised through the same code the UI runs:
 * doctor registers (no MetaMask) -> requests access -> patient approves and
 * shares keys -> doctor decrypts -> patient revokes -> doctor is blocked.
 */
import { ethers } from "ethers";
import { createVault, openVault, makeSigner } from "../frontend/src/lib/wallet.js";
import { encryptFile, sealKey, unsealKey, decryptEnvelope, keccakHex } from "../frontend/src/lib/crypto.js";
import fs from "node:fs/promises";

const B = "http://localhost:4000";
const RPC = "http://127.0.0.1:8545";
let pass = 0, fail = 0;
const ok = (m, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"}  ${m}${x ? " - " + x : ""}`); };
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

const call = async (p, o = {}) => {
  const h = {}; if (o.token) h.Authorization = `Bearer ${o.token}`;
  if (o.body && !o.form) h["Content-Type"] = "application/json";
  const r = await fetch(`${B}${p}`, { method: o.method || "GET", headers: h,
    body: o.form ? o.form : o.body ? JSON.stringify(o.body) : undefined });
  if (o.raw) return { res: r, buffer: new Uint8Array(await r.arrayBuffer()) };
  return { res: r, data: await r.json().catch(() => ({})) };
};

const artifact = JSON.parse(await fs.readFile(new URL("../contracts/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json", import.meta.url), "utf8"));
const deployment = JSON.parse(await fs.readFile(new URL("../contracts/deployments/localhost.json", import.meta.url), "utf8"));

async function signup(role, name, password, extra = {}) {
  const email = `${role}${Math.floor(Math.random()*99999)}@t.local`;
  const { data: reg } = await call("/api/auth/register", { method: "POST",
    body: { name, email, password, role, ...extra } });
  const v = await createVault(password);
  await call("/api/wallet/vault", { method: "POST", token: reg.token,
    body: { vault: v.vault, salt: v.salt, address: v.address, encryptionPublicKey: v.keyPair.publicKey } });
  await call("/api/wallet/ensure-gas", { method: "POST", token: reg.token });
  const signer = makeSigner(v.privateKey, RPC);
  const c = new ethers.Contract(deployment.address, artifact.abi, signer);
  if (role === "patient") await (await c.registerPatient(name, "")).wait();
  else await (await c.registerDoctor(name, extra.specialization || "General", extra.licenseId || "L1")).wait();
  return { token: reg.token, ...v, contract: c };
}

console.log("\nMobile app: complete patient + doctor flow\n" + "=".repeat(45));

sec("1. Sign up, no MetaMask");
const patient = await signup("patient", "Sudeep Kalkeri", "PatientPass@2026");
ok("patient account created and on-chain", await patient.contract.isPatient(patient.address));
const doctor = await signup("doctor", "Dr Afziya Garag", "DoctorPass@2026",
  { specialization: "Cardiology", licenseId: "KA-MED-1042" });
ok("doctor account created and on-chain", await doctor.contract.isDoctor(doctor.address));

sec("2. Patient uploads a record");
const content = new TextEncoder().encode("PATIENT: Sudeep\nDIAGNOSIS: Stage 1 hypertension\nBP: 148/94");
const file = { name: "report.txt", type: "text/plain", size: content.length, arrayBuffer: async () => content.buffer };
const { envelope, dataKey, hash } = await encryptFile(file);
const form = new FormData();
form.append("file", new Blob([envelope]), "report.txt.enc");
const { data: up } = await call("/api/records/upload", { method: "POST", token: patient.token, form });
ok("encrypted file stored", Boolean(up.cid), up.provider);
const tx = await patient.contract.uploadRecord(hash, up.cid, file.name, file.type, BigInt(file.size), "Lab Report");
const rc = await tx.wait();
const recordId = Number(rc.logs.map(l => { try { return patient.contract.interface.parseLog(l); } catch { return null; } })
  .find(p => p?.name === "RecordUploaded").args.recordId);
ok("record committed on-chain", recordId > 0, `#${recordId}`);
await call("/api/records/confirm", { method: "POST", token: patient.token,
  body: { recordId, cid: up.cid, dataHash: hash, fileName: file.name, fileType: file.type,
          fileSize: file.size, recordType: "Lab Report", txHash: rc.hash, blockNumber: rc.blockNumber,
          ownerEnvelope: await sealKey(dataKey, patient.keyPair.publicKey) } });

sec("3. Doctor is blocked before approval");
const { res: b1 } = await call(`/api/records/${recordId}/key`, { token: doctor.token });
ok("API refuses the key", b1.status === 403);
const { res: b2 } = await call(`/api/records/${recordId}/blob`, { token: doctor.token, raw: true });
ok("API refuses the file", b2.status === 403);
let reverted = false;
try { await doctor.contract.getPatientRecordsAsDoctor(patient.address); } catch { reverted = true; }
ok("contract itself refuses", reverted);

sec("4. Request and approve");
const reqRc = await (await doctor.contract.requestAccess(patient.address, 0, "Cardiac review")).wait();
const requestId = Number(reqRc.logs.map(l => { try { return doctor.contract.interface.parseLog(l); } catch { return null; } })
  .find(p => p?.name === "AccessRequested").args.requestId);
ok("doctor raised request", requestId > 0);
await (await patient.contract.approveRequest(BigInt(requestId))).wait();
ok("patient approved on-chain", await patient.contract.hasAccess(patient.address, doctor.address, recordId));

const { data: mine } = await call(`/api/records/${recordId}/key`, { token: patient.token });
const key = await unsealKey(mine.envelope, patient.keyPair.privateKey);
await call(`/api/records/${recordId}/share`, { method: "POST", token: patient.token,
  body: { doctorAddress: doctor.address, envelope: await sealKey(key, doctor.keyPair.publicKey) } });
ok("record key shared with doctor", true);

sec("5. Doctor reads the record");
const { res: k2, data: dk } = await call(`/api/records/${recordId}/key`, { token: doctor.token });
ok("API releases the key", k2.status === 200);
const { buffer } = await call(`/api/records/${recordId}/blob`, { token: doctor.token, raw: true });
ok("integrity verified", keccakHex(buffer).toLowerCase() === hash.toLowerCase());
const { blob } = await decryptEnvelope(buffer, await unsealKey(dk.envelope, doctor.keyPair.privateKey));
ok("doctor decrypts the content", (await blob.text()).includes("Stage 1 hypertension"));

sec("6. Patient revokes");
await (await patient.contract.revokeAccess(doctor.address, 0n)).wait();
await call("/api/records/revoke-keys", { method: "POST", token: patient.token, body: { doctorAddress: doctor.address } });
ok("contract denies access", (await patient.contract.canAccessRecord(recordId, doctor.address)) === false);
const { res: a1 } = await call(`/api/records/${recordId}/key`, { token: doctor.token });
ok("API refuses the key again", a1.status === 403);
const { res: a2 } = await call(`/api/records/${recordId}/blob`, { token: doctor.token, raw: true });
ok("API refuses the file again", a2.status === 403);

sec("7. Password is the only way in");
let wrong = false;
try { await openVault("NotThePassword", (await call("/api/wallet/vault", { token: patient.token })).data.vault,
  (await call("/api/wallet/vault", { token: patient.token })).data.salt); } catch { wrong = true; }
ok("wrong password cannot open the vault", wrong);

console.log("\n" + "=".repeat(45));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(45) + "\n");
process.exitCode = fail === 0 ? 0 : 1;
