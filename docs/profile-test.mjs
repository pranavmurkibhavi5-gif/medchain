/**
 * Health-profile encryption, exercised through the same module the UI uses.
 *
 * The point of these assertions is the security claim: the profile is
 * unreadable without a key sealed to your own wallet, and dropping a doctor
 * from the recipient list actually locks them out rather than merely hiding a
 * button.
 */
import * as secp from "@noble/secp256k1";

import {
  EMPTY_PROFILE,
  PROFILE_FIELDS,
  ageFrom,
  decryptProfile,
  encryptProfile,
  hasContent,
  openProfileKey,
  sealProfileKey,
} from "../frontend/src/lib/profile.js";
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

const PROFILE = {
  ...EMPTY_PROFILE,
  fullName: "Sudeep Kalkeri",
  dateOfBirth: "2003-04-18",
  sex: "Male",
  bloodGroup: "O+",
  allergies: "Penicillin",
  conditions: "Stage 1 hypertension",
  medications: "Amlodipine 5mg",
  emergencyName: "Rekha Kalkeri",
  emergencyPhone: "+91 90000 00000",
};

console.log("\nHealth profile: encryption and sharing\n" + "=".repeat(38));

const patient = identity();
const doctorA = identity();
const doctorB = identity();

sec("1. Round trip");
const { envelope, dataKey } = await encryptProfile(PROFILE);
ok("envelope carries no plaintext", !JSON.stringify(envelope).includes("Penicillin"));
ok("envelope is base64 fields only", typeof envelope.ct === "string" && typeof envelope.iv === "string");
const back = await decryptProfile(envelope, dataKey);
ok("decrypts to the same profile", JSON.stringify(back) === JSON.stringify(PROFILE));

sec("2. Sealing to recipients");
const wrapped = await sealProfileKey(dataKey, [
  { address: "0xAAAA000000000000000000000000000000000001", publicKey: patient.publicKey },
  { address: "0xBBBB000000000000000000000000000000000002", publicKey: doctorA.publicKey },
]);
ok("one envelope per recipient", wrapped.length === 2, `${wrapped.length}`);
ok("addresses normalised to lower case", wrapped.every((w) => w.forAddress === w.forAddress.toLowerCase()));

const patientKey = await openProfileKey(wrapped[0].envelope, patient.privateKey);
ok("patient recovers the data key", toHex(patientKey) === toHex(dataKey));

const docKey = await openProfileKey(wrapped[1].envelope, doctorA.privateKey);
const docView = await decryptProfile(envelope, docKey);
ok("approved doctor reads the profile", docView.bloodGroup === "O+" && docView.allergies === "Penicillin");

sec("3. An unapproved doctor is locked out");
let refused = false;
try {
  await openProfileKey(wrapped[1].envelope, doctorB.privateKey);
} catch {
  refused = true;
}
ok("cannot unseal an envelope meant for someone else", refused);

let tampered = false;
try {
  await decryptProfile(envelope, secp.utils.randomPrivateKey());
} catch {
  tampered = true;
}
ok("cannot decrypt with the wrong data key", tampered);

sec("4. Revocation actually revokes");
// A save re-encrypts under a fresh key and re-seals only to those who remain.
const { envelope: envelope2, dataKey: dataKey2 } = await encryptProfile({
  ...PROFILE,
  conditions: "Stage 1 hypertension; reviewed",
});
const wrapped2 = await sealProfileKey(dataKey2, [
  { address: "0xAAAA000000000000000000000000000000000001", publicKey: patient.publicKey },
]);
ok("dropped doctor gets no envelope", wrapped2.length === 1);
ok("new data key differs from the old", toHex(dataKey2) !== toHex(dataKey));

let stale = false;
try {
  // The doctor still holds their old key. It must not open the new profile.
  await decryptProfile(envelope2, docKey);
} catch {
  stale = true;
}
ok("their old key cannot read the updated profile", stale);

sec("5. Helpers");
ok("age computed from date of birth", typeof ageFrom("2003-04-18") === "number");
ok("blank date gives no age", ageFrom("") === "");
ok("rubbish date gives no age", ageFrom("not-a-date") === "");
ok("empty profile counts as empty", hasContent(EMPTY_PROFILE) === false);
ok("filled profile counts as filled", hasContent(PROFILE) === true);
ok("every field has a label key", PROFILE_FIELDS.every((f) => f.label.startsWith("profile.")));

console.log("\n" + "=".repeat(38));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(38) + "\n");
process.exit(fail ? 1 : 0);
