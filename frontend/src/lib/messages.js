/**
 * Doctor-patient messages: encryption and the expiry rule.
 *
 * A message is encrypted in the browser and sealed to both participants, so
 * the server stores ciphertext it cannot read. Nothing goes on the blockchain:
 * a conversation about symptoms is exactly what must not be written to a
 * public ledger.
 *
 * Messages disappear 24 hours after the recipient reads them. Unread messages
 * are kept, because one that vanished before it was seen would be worse than
 * useless.
 *
 * This is a retention rule, not a security guarantee. Someone who can read a
 * message can photograph it, and no amount of client code prevents that - the
 * interface says so rather than implying otherwise.
 *
 * Pure: no network calls, so it can be exercised outside a browser.
 */
import { encryptProfile, decryptProfile, sealProfileKey, openProfileKey } from "./profile.js";

export const READ_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const MAX_LENGTH = 2000;

/**
 * Encrypt one message and seal it to both participants.
 *
 * @param {string} text
 * @param {{address: string, publicKey: string}} me
 * @param {{address: string, publicKey: string}} them
 */
export async function encryptMessage(text, me, them) {
  const body = String(text || "").trim();
  if (!body) throw new Error("Nothing to send");
  if (body.length > MAX_LENGTH) throw new Error("That message is too long");

  const { envelope, dataKey } = await encryptProfile({ body });
  const keys = await sealProfileKey(dataKey, [me, them]);
  return { envelope, keys };
}

/** Recover the text. Throws if this wallet was not one of the two parties. */
export async function decryptMessage(envelope, sealed, privateKey) {
  const dataKey = await openProfileKey(sealed, privateKey);
  const { body } = await decryptProfile(envelope, dataKey);
  return body || "";
}

/**
 * Milliseconds until a message disappears, or null when it has not been read
 * and so is not counted down at all.
 */
export function msUntilGone(message, now = Date.now()) {
  if (!message?.expiresAt) return null;
  return Math.max(0, new Date(message.expiresAt).getTime() - now);
}

/** "23h left", "45m left", "under a minute". Returns "" when not yet read. */
export function expiryLabel(message, t, now = Date.now()) {
  const left = msUntilGone(message, now);
  if (left === null) return "";
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 1) return t("chat.hoursLeft", { n: hours });
  const minutes = Math.floor(left / 60_000);
  if (minutes >= 1) return t("chat.minutesLeft", { n: minutes });
  return t("chat.aboutToGo");
}

/** Group messages by calendar day, for date separators in the thread. */
export function groupByDay(messages) {
  const groups = [];
  for (const m of messages) {
    const day = new Date(m.sentAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }
  return groups;
}

/** Short clock time for a bubble. */
export const clockTime = (value) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
