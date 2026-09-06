/**
 * Doctor-patient messaging: encryption and the 24-hour expiry rule.
 *
 * Two claims are worth pinning down. First, a message is readable by exactly
 * the two participants and nobody else - including the server, which holds the
 * ciphertext. Second, the countdown starts on reading, not on sending, so a
 * message cannot expire before anyone has seen it.
 */
import * as secp from "@noble/secp256k1";

import {
  MAX_LENGTH,
  READ_LIFETIME_MS,
  clockTime,
  decryptMessage,
  encryptMessage,
  expiryLabel,
  groupByDay,
  msUntilGone,
} from "../frontend/src/lib/messages.js";
import { toHex } from "../frontend/src/lib/crypto.js";

let pass = 0;
let fail = 0;
const ok = (m, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${m}${extra ? ` - ${extra}` : ""}`);
};
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

const CATALOGUE = {
  "chat.hoursLeft": "{n}h left",
  "chat.minutesLeft": "{n}m left",
  "chat.aboutToGo": "going soon",
};
const t = (key, vars = {}) =>
  Object.entries(vars).reduce((a, [k, v]) => a.replace(`{${k}}`, v), CATALOGUE[key] || key);

const identity = (address) => {
  const privateKey = secp.utils.randomPrivateKey();
  return { address, privateKey, publicKey: toHex(secp.getPublicKey(privateKey, false)) };
};

const PATIENT = identity("0xAAAA000000000000000000000000000000000001");
const DOCTOR = identity("0xBBBB000000000000000000000000000000000002");
const OUTSIDER = identity("0xCCCC000000000000000000000000000000000003");

const TEXT = "My blood pressure was 148/94 this morning. Should I come in?";

console.log("\nChat: encryption and expiry\n" + "=".repeat(27));

sec("1. Sealed to both participants");
const { envelope, keys } = await encryptMessage(TEXT, PATIENT, DOCTOR);
ok("no plaintext in the envelope", !JSON.stringify(envelope).includes("blood pressure"));
ok("sealed to exactly two people", keys.length === 2, String(keys.length));
ok(
  "sealed to the patient and the doctor",
  keys.map((k) => k.forAddress).sort().join(",") ===
    [PATIENT.address.toLowerCase(), DOCTOR.address.toLowerCase()].sort().join(",")
);

sec("2. Both read it, nobody else does");
ok("patient reads it", (await decryptMessage(envelope, keys[0].envelope, PATIENT.privateKey)) === TEXT);
ok("doctor reads it", (await decryptMessage(envelope, keys[1].envelope, DOCTOR.privateKey)) === TEXT);

let refused = false;
try {
  await decryptMessage(envelope, keys[1].envelope, OUTSIDER.privateKey);
} catch {
  refused = true;
}
ok("an outsider cannot", refused);

sec("3. Refusing to send nonsense");
let rejectedEmpty = false;
try {
  await encryptMessage("   ", PATIENT, DOCTOR);
} catch {
  rejectedEmpty = true;
}
ok("an empty message is refused", rejectedEmpty);

let rejectedLong = false;
try {
  await encryptMessage("x".repeat(MAX_LENGTH + 1), PATIENT, DOCTOR);
} catch {
  rejectedLong = true;
}
ok("an over-long message is refused", rejectedLong);

sec("4. The clock starts on reading, not sending");
const now = Date.now();
const unread = { sentAt: new Date(now - 5 * 86400000).toISOString(), readAt: null, expiresAt: null };
ok("an unread message has no countdown", msUntilGone(unread, now) === null);
ok("and shows no expiry label", expiryLabel(unread, t, now) === "");

const justRead = { expiresAt: new Date(now + READ_LIFETIME_MS).toISOString() };
ok("a just-read message has ~24h", Math.round(msUntilGone(justRead, now) / 3600000) === 24);
ok("the lifetime is 24 hours", READ_LIFETIME_MS === 24 * 60 * 60 * 1000);

const nearlyGone = { expiresAt: new Date(now + 90 * 60 * 1000).toISOString() };
ok("hours are shown while hours remain", expiryLabel(nearlyGone, t, now) === "1h left");

const minutesLeft = { expiresAt: new Date(now + 20 * 60 * 1000).toISOString() };
ok("minutes are shown near the end", expiryLabel(minutesLeft, t, now) === "20m left");

const secondsLeft = { expiresAt: new Date(now + 30 * 1000).toISOString() };
ok("the last minute is not '0m left'", expiryLabel(secondsLeft, t, now) === "going soon");

const past = { expiresAt: new Date(now - 60 * 1000).toISOString() };
ok("an expired message never reports negative time", msUntilGone(past, now) === 0);

sec("5. Thread rendering");
const day = 86400000;
const grouped = groupByDay([
  { sentAt: new Date(now - 2 * day).toISOString() },
  { sentAt: new Date(now - 2 * day + 3600000).toISOString() },
  { sentAt: new Date(now).toISOString() },
]);
ok("messages group into days", grouped.length === 2, String(grouped.length));
ok("same-day messages stay together", grouped[0].items.length === 2);
ok("a clock time is produced", /\d/.test(clockTime(new Date(now).toISOString())));

console.log("\n" + "=".repeat(27));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(27) + "\n");
process.exit(fail ? 1 : 0);
