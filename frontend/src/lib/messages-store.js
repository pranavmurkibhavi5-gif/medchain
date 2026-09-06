/**
 * Message API calls.
 *
 * Split from messages.js so the encryption and expiry logic there depends on
 * nothing but the Web Crypto API and can be tested outside a browser.
 */
import { api } from "./api";
import { decryptMessage, encryptMessage } from "./messages.js";

/** Conversations, newest first, with unread counts. */
export const listThreads = () => api.messageThreads();

/**
 * Open one conversation. Fetching it is what starts the 24-hour clock on
 * anything addressed to you, so the server does the marking, not the client.
 */
export async function openThread(wallet, keyPair) {
  const { messages, other } = await api.messagesWith(wallet);

  const decrypted = await Promise.all(
    (messages || []).map(async (m) => {
      if (!m.sealed || !m.envelope) return { ...m, text: "", unreadable: true };
      try {
        return { ...m, text: await decryptMessage(m.envelope, m.sealed, keyPair.privateKey) };
      } catch (err) {
        // Not sealed for this wallet, or altered. Show the message existed
        // rather than silently dropping it.
        console.warn("[chat] unreadable message:", err.message);
        return { ...m, text: "", unreadable: true };
      }
    })
  );

  return { messages: decrypted, other };
}

/**
 * Send a message.
 *
 * @param {{address: string, publicKey: string}} me
 * @param {{address: string, publicKey: string}} them
 */
export async function sendMessage(text, me, them) {
  const { envelope, keys } = await encryptMessage(text, me, them);
  return api.sendMessage({ toAddress: them.address, envelope, keys });
}

export const deleteMessage = (id) => api.deleteMessage(id);
