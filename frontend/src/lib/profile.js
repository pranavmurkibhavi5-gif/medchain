/**
 * The patient's health profile.
 *
 * Age, sex, blood group, allergies and conditions are medical data, so they
 * get the same treatment a record does: AES-256-GCM in the browser, and the
 * data key sealed to each recipient with ECIES. The server stores ciphertext
 * and sealed envelopes only.
 *
 * Records use the binary BMR1 envelope because they carry a file and its
 * metadata. A profile is a small JSON object, so it uses a plain
 * {iv, ct} envelope instead - same cipher, same key size, less machinery.
 * crypto.js is untouched; this module only composes its primitives.
 */
import { generateDataKey, sealKey, unsealKey, toB64, fromB64 } from "./crypto.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const aesKey = (raw, usage) =>
  crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usage);

/** Fields the form collects. `long` renders a textarea. */
export const PROFILE_FIELDS = [
  { key: "fullName", label: "profile.fullName" },
  { key: "dateOfBirth", label: "profile.dateOfBirth", type: "date" },
  { key: "sex", label: "profile.sex", options: ["", "Female", "Male", "Other"] },
  {
    key: "bloodGroup",
    label: "profile.bloodGroup",
    options: ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  { key: "allergies", label: "profile.allergies", long: true },
  { key: "conditions", label: "profile.conditions", long: true },
  { key: "medications", label: "profile.medications", long: true },
  { key: "emergencyName", label: "profile.emergencyName" },
  { key: "emergencyPhone", label: "profile.emergencyPhone", type: "tel" },
];

export const EMPTY_PROFILE = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, ""]));

/** Age in whole years, or "" when no usable date of birth is stored. */
export function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return "";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : "";
}

/** Encrypt the profile under a fresh (or supplied) data key. */
export async function encryptProfile(data, dataKey = generateDataKey()) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(dataKey, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(data))
    )
  );
  return { envelope: { v: 1, iv: toB64(iv), ct: toB64(ct) }, dataKey };
}

/** Reverse of encryptProfile. Throws if the key is wrong or bytes were altered. */
export async function decryptProfile(envelope, dataKey) {
  const key = await aesKey(dataKey, ["decrypt"]);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(envelope.iv) },
      key,
      fromB64(envelope.ct)
    );
  } catch {
    throw new Error("Could not decrypt the health profile");
  }
  return JSON.parse(decoder.decode(new Uint8Array(plain)));
}

/**
 * Seal one data key to every recipient.
 * @param {Uint8Array} dataKey
 * @param {Array<{address: string, publicKey: string}>} recipients
 */
export async function sealProfileKey(dataKey, recipients) {
  const out = [];
  for (const r of recipients) {
    if (!r || !r.address || !r.publicKey) continue;
    // eslint-disable-next-line no-await-in-loop
    out.push({ forAddress: r.address.toLowerCase(), envelope: await sealKey(dataKey, r.publicKey) });
  }
  return out;
}

/** Recover the data key from the envelope sealed to this wallet. */
export const openProfileKey = (sealed, privateKey) => unsealKey(sealed, privateKey);

/** True when the patient has actually filled something in. */
export const hasContent = (profile) =>
  Boolean(profile) && Object.values(profile).some((v) => String(v || "").trim() !== "");
