/**
 * Appointment helpers and the encryption of the visit reason.
 *
 * The claims worth checking: the reason is readable by exactly the two people
 * involved and nobody else, an empty reason produces no ciphertext at all
 * rather than an encrypted empty string, and the datetime-local formatting
 * does not silently shift the hour by the timezone offset.
 */
import * as secp from "@noble/secp256k1";

import {
  OPEN_STATUSES,
  STATUS_TONE,
  decryptReason,
  encryptReason,
  nextHour,
  toLocalInput,
} from "../frontend/src/lib/appointments.js";
import { toHex } from "../frontend/src/lib/crypto.js";

let pass = 0;
let fail = 0;
const ok = (m, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${m}${extra ? ` - ${extra}` : ""}`);
};
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

const identity = () => {
  const privateKey = secp.utils.randomPrivateKey();
  return { privateKey, publicKey: toHex(secp.getPublicKey(privateKey, false)) };
};

const PATIENT_ADDR = "0xAAAA000000000000000000000000000000000001";
const DOCTOR_ADDR = "0xBBBB000000000000000000000000000000000002";

console.log("\nAppointments: reason encryption and helpers\n" + "=".repeat(43));

const patient = identity();
const doctor = identity();
const stranger = identity();
const REASON = "Follow-up on blood pressure; chest tightness after climbing stairs";

sec("1. The reason is sealed to both parties");
const { reasonEnvelope, reasonKeys } = await encryptReason(REASON, {
  myAddress: PATIENT_ADDR,
  myPublicKey: patient.publicKey,
  doctor: { address: DOCTOR_ADDR, publicKey: doctor.publicKey },
});

ok("an envelope was produced", Boolean(reasonEnvelope));
ok("no plaintext in the envelope", !JSON.stringify(reasonEnvelope).includes("chest"));
ok("sealed to exactly two people", reasonKeys.length === 2, `${reasonKeys.length}`);
ok(
  "sealed to the patient and the doctor",
  reasonKeys.map((k) => k.forAddress).sort().join(",") ===
    [PATIENT_ADDR.toLowerCase(), DOCTOR_ADDR.toLowerCase()].sort().join(",")
);

sec("2. Both parties can read it");
const byPatient = await decryptReason(reasonEnvelope, reasonKeys[0].envelope, patient.privateKey);
ok("patient reads their own reason", byPatient === REASON);

const byDoctor = await decryptReason(reasonEnvelope, reasonKeys[1].envelope, doctor.privateKey);
ok("doctor reads the reason", byDoctor === REASON);

sec("3. Nobody else can");
let refused = false;
try {
  await decryptReason(reasonEnvelope, reasonKeys[1].envelope, stranger.privateKey);
} catch {
  refused = true;
}
ok("a third party cannot unseal it", refused);

sec("4. An empty reason is not encrypted");
const blank = await encryptReason("   ", {
  myAddress: PATIENT_ADDR,
  myPublicKey: patient.publicKey,
  doctor: { address: DOCTOR_ADDR, publicKey: doctor.publicKey },
});
ok("no envelope for a blank reason", blank.reasonEnvelope === null);
ok("no keys for a blank reason", blank.reasonKeys.length === 0);

sec("5. Time handling");
const base = new Date("2026-09-04T14:37:22.500");
const next = nextHour(base);
ok("rounds up to the next whole hour", next.getHours() === 15 && next.getMinutes() === 0);
ok("seconds and milliseconds cleared", next.getSeconds() === 0 && next.getMilliseconds() === 0);
ok("does not mutate the input", base.getMinutes() === 37);

const local = toLocalInput(new Date(2026, 0, 5, 9, 7));
ok("datetime-local format with padding", local === "2026-01-05T09:07", local);

// The bug this guards against: using toISOString() here would shift the
// displayed hour by the machine's UTC offset.
const noon = new Date(2026, 5, 15, 12, 0);
ok("keeps local hour, not UTC", toLocalInput(noon).endsWith("T12:00"), toLocalInput(noon));

const roundTrip = new Date(toLocalInput(noon));
ok("parses back to the same instant", roundTrip.getTime() === noon.getTime());

sec("6. Status vocabulary");
ok("every status has a colour", Object.keys(STATUS_TONE).length === 5);
ok("open statuses need someone to act", OPEN_STATUSES.join(",") === "requested,confirmed");
ok(
  "open statuses are real statuses",
  OPEN_STATUSES.every((s) => s in STATUS_TONE)
);

console.log("\n" + "=".repeat(43));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(43) + "\n");
process.exit(fail ? 1 : 0);
