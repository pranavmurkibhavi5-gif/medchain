/**
 * Record operations shared by the patient and doctor views.
 * Keeping them here means the decrypt/verify path is written once, so both
 * roles get the same integrity guarantees.
 */
import { api } from "./api";
import { decryptEnvelope, unsealKey, sealKey, keccakHex } from "./crypto";

/**
 * Download the encrypted blob, verify it against the on-chain hash, unseal the
 * data key and decrypt - the full read path.
 *
 * @returns {Promise<{blob: Blob, meta: object, verified: boolean, dataHash: string}>}
 */
export async function openRecord(record, keyPair) {
  if (!keyPair) throw new Error("Unlock your encryption key first");

  const recordId = record.recordId ?? record.id;

  // 1. The sealed data key (server re-checks the chain before releasing it).
  const { envelope: sealed } = await api.recordKey(recordId);

  // 2. The ciphertext itself.
  const { buffer, headers } = await api.recordBlob(recordId);

  // 3. Independent integrity check in the browser - never just trust the header.
  const localHash = keccakHex(buffer);
  const expected = record.dataHash || headers.get("X-BMR-Data-Hash");
  const verified = Boolean(expected) && localHash.toLowerCase() === expected.toLowerCase();

  if (!verified) {
    throw new Error(
      `Integrity check FAILED. The file does not match the hash recorded on the blockchain.\n\nExpected: ${expected}\nActual:   ${localHash}`
    );
  }

  // 4. Unseal the AES key, then decrypt.
  const dataKey = await unsealKey(sealed, keyPair.privateKey);
  const { blob, meta } = await decryptEnvelope(buffer, dataKey);

  return { blob, meta, verified, dataHash: localHash, dataKey };
}

/** Re-seal a record's data key for a doctor so they can decrypt it. */
export async function shareRecordKey(record, doctorAddress, doctorPublicKey, keyPair) {
  const recordId = record.recordId ?? record.id;

  const { envelope: sealedForMe } = await api.recordKey(recordId);
  const dataKey = await unsealKey(sealedForMe, keyPair.privateKey);

  const sealedForDoctor = await sealKey(dataKey, doctorPublicKey);
  await api.shareKey(recordId, { doctorAddress, envelope: sealedForDoctor });
}

/** Share every record the patient owns with one doctor (used on approve/grant). */
export async function shareAllRecordKeys(records, doctorAddress, doctorPublicKey, keyPair, onProgress) {
  let shared = 0;
  const failures = [];
  for (const record of records) {
    try {
      await shareRecordKey(record, doctorAddress, doctorPublicKey, keyPair);
      shared += 1;
      if (onProgress) onProgress(shared, records.length);
    } catch (err) {
      failures.push({ recordId: record.recordId ?? record.id, error: err.message });
    }
  }
  return { shared, failures };
}

/** Trigger a browser download of a decrypted file. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "medical-record";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** True when the browser can render this type inline in a preview pane. */
export function isPreviewable(type = "") {
  return (
    type.startsWith("image/") ||
    type === "application/pdf" ||
    type.startsWith("text/") ||
    type === "application/json"
  );
}

export const RECORD_TYPES = [
  "Lab Report",
  "Prescription",
  "Radiology / Scan",
  "Discharge Summary",
  "Vaccination Record",
  "Consultation Note",
  "Insurance Document",
  "Other",
];

/** Map the contract's RequestStatus enum to something displayable. */
export const REQUEST_STATUS = {
  0: { label: "Unknown", cls: "badge-slate" },
  1: { label: "Pending", cls: "badge-amber" },
  2: { label: "Approved", cls: "badge-green" },
  3: { label: "Rejected", cls: "badge-red" },
  4: { label: "Revoked", cls: "badge-slate" },
};
