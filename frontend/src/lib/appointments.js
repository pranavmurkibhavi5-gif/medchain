/**
 * Appointment helpers and the encryption of the visit reason.
 *
 * The appointment itself is ordinary scheduling data and lives off-chain: the
 * contract is fixed, and there is nothing to gain from making a time slot
 * immutable - it needs to be rescheduled and cancelled. Publishing it on a
 * public chain would also record, permanently, which specialist a person sees.
 *
 * What is protected is the reason for the visit, which is clinical. It is
 * encrypted here and sealed to the patient and to that one doctor, so the
 * server can list an appointment without ever learning what it is for.
 *
 * Pure: no network calls, so it can be exercised outside a browser. The API
 * side lives in appointments-store.js.
 */
import { encryptProfile, decryptProfile, sealProfileKey, openProfileKey } from "./profile.js";

export const STATUS_TONE = {
  requested: "bg-amber-50 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  declined: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Statuses that still need someone to act, and so appear under "Upcoming". */
export const OPEN_STATUSES = ["requested", "confirmed"];

/** Smallest bookable moment: the next whole hour. */
export function nextHour(from = new Date()) {
  const d = new Date(from.getTime());
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/**
 * `YYYY-MM-DDTHH:mm` in LOCAL time, which is what <input type="datetime-local">
 * expects. Deliberately not toISOString(), which would shift the value by the
 * timezone offset and quietly show the patient the wrong hour.
 */
export function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Encrypt the reason for a visit and seal it to both parties.
 * An empty reason produces no envelope at all rather than encrypting "".
 *
 * @returns {Promise<{reasonEnvelope: object|null, reasonKeys: Array}>}
 */
export async function encryptReason(reason, { myAddress, myPublicKey, doctor }) {
  const text = (reason || "").trim();
  if (!text) return { reasonEnvelope: null, reasonKeys: [] };

  const { envelope, dataKey } = await encryptProfile({ reason: text });
  const reasonKeys = await sealProfileKey(dataKey, [
    { address: myAddress, publicKey: myPublicKey },
    { address: doctor.address, publicKey: doctor.publicKey },
  ]);
  return { reasonEnvelope: envelope, reasonKeys };
}

/** Recover the reason. Throws if this wallet was not one of the two parties. */
export async function decryptReason(envelope, sealed, privateKey) {
  const dataKey = await openProfileKey(sealed, privateKey);
  const { reason } = await decryptProfile(envelope, dataKey);
  return reason || "";
}
