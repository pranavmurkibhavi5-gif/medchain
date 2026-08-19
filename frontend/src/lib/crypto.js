/**
 * Client-side cryptography.
 *
 * Every byte of medical content is encrypted here, in the browser, before it
 * goes anywhere. The server and IPFS only ever hold ciphertext.
 *
 * Scheme
 * ------
 * 1. Each record gets a fresh random 256-bit AES-GCM "data key".
 * 2. The file is encrypted with that data key -> BMR1 envelope -> IPFS.
 * 3. keccak256(envelope bytes) is the integrity hash committed on-chain.
 * 4. The data key itself is sealed (ECIES over secp256k1) to the recipient's
 *    public key - the patient's own key on upload, and additionally a doctor's
 *    key when access is granted. Only the holder of the matching private key
 *    can unseal it.
 *
 * Where does a user's keypair come from, given MetaMask never exports a private
 * key? It is *derived* from a MetaMask signature over a fixed domain string.
 * MetaMask uses RFC-6979 deterministic ECDSA, so the same wallet signing the
 * same message always produces the same bytes; hashing them yields a stable
 * secp256k1 keypair that exists only in memory for the session. Nothing to
 * store, nothing to lose, and the server only ever learns the public half.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import { hkdf } from "@noble/hashes/hkdf";
import * as secp from "@noble/secp256k1";

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------
export const toHex = (bytes) =>
  "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

export const fromHex = (hex) => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};

export const toB64 = (bytes) => {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
};

export const fromB64 = (b64) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/** keccak256 of arbitrary bytes - matches Solidity's keccak256(bytes). */
export const keccakHex = (bytes) => toHex(keccak_256(bytes));

// ---------------------------------------------------------------------------
// Identity key derivation (from a MetaMask signature)
// ---------------------------------------------------------------------------

export const KEY_DERIVATION_MESSAGE =
  "MedChain - Blockchain-Based Secure Medical Record\n\n" +
  "Sign this message to unlock your personal encryption key.\n\n" +
  "This signature never leaves your browser and costs no gas.\n" +
  "Only sign this on the official MedChain application.\n\n" +
  "Domain: medchain.record.v1";

/**
 * Turn a wallet signature into a stable secp256k1 keypair.
 * @param {string} signature 0x-prefixed personal_sign output
 */
export function deriveKeyPairFromSignature(signature) {
  const sigBytes = fromHex(signature);
  // Domain-separated hash so this key can never collide with a signing key.
  const material = new Uint8Array([...sigBytes, ...new TextEncoder().encode("medchain-ecies-v1")]);
  let priv = sha256(material);

  // Vanishingly unlikely, but keep hashing until it is a valid scalar.
  let guard = 0;
  while (!secp.utils.isValidPrivateKey(priv) && guard++ < 16) priv = sha256(priv);

  const pub = secp.getPublicKey(priv, false); // uncompressed, 65 bytes
  return { privateKey: priv, publicKey: toHex(pub) };
}

// ---------------------------------------------------------------------------
// AES-GCM file encryption
// ---------------------------------------------------------------------------

const MAGIC = new TextEncoder().encode("BMR1"); // envelope marker

export function generateDataKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function importAesKey(rawKey, usage) {
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, usage);
}

/**
 * Encrypt a file into a self-describing BMR1 envelope.
 *
 * Layout: "BMR1" | 12-byte IV | 2-byte metaLen | metaJSON | ciphertext+tag
 * The metadata (original name/type) is inside the encrypted region's AAD so it
 * cannot be tampered with, while staying readable to whoever holds the key.
 *
 * @returns {Promise<{envelope: Uint8Array, dataKey: Uint8Array, hash: string}>}
 */
export async function encryptFile(file, dataKey = generateDataKey()) {
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const meta = new TextEncoder().encode(
    JSON.stringify({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: plaintext.length,
      encryptedAt: new Date().toISOString(),
    })
  );

  const key = await importAesKey(dataKey, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: meta }, key, plaintext)
  );

  const metaLen = new Uint8Array(2);
  new DataView(metaLen.buffer).setUint16(0, meta.length, false);

  const envelope = new Uint8Array(
    MAGIC.length + iv.length + 2 + meta.length + cipher.length
  );
  let o = 0;
  envelope.set(MAGIC, o); o += MAGIC.length;
  envelope.set(iv, o); o += iv.length;
  envelope.set(metaLen, o); o += 2;
  envelope.set(meta, o); o += meta.length;
  envelope.set(cipher, o);

  return { envelope, dataKey, hash: keccakHex(envelope) };
}

/**
 * Reverse of encryptFile.
 * @returns {Promise<{blob: Blob, meta: object}>}
 */
export async function decryptEnvelope(envelope, dataKey) {
  const bytes = envelope instanceof Uint8Array ? envelope : new Uint8Array(envelope);

  const marker = new TextDecoder().decode(bytes.subarray(0, 4));
  if (marker !== "BMR1") throw new Error("Not a MedChain encrypted envelope");

  let o = 4;
  const iv = bytes.subarray(o, o + 12); o += 12;
  const metaLen = new DataView(bytes.buffer, bytes.byteOffset + o, 2).getUint16(0, false); o += 2;
  const meta = bytes.subarray(o, o + metaLen); o += metaLen;
  const cipher = bytes.subarray(o);

  const key = await importAesKey(dataKey, ["decrypt"]);
  let plain;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: meta }, key, cipher)
    );
  } catch {
    // GCM tag mismatch: wrong key, or the ciphertext was altered.
    throw new Error("Decryption failed - wrong key or the file has been tampered with");
  }

  const info = JSON.parse(new TextDecoder().decode(meta));
  return { blob: new Blob([plain], { type: info.type || "application/octet-stream" }), meta: info };
}

// ---------------------------------------------------------------------------
// ECIES - sealing a data key to someone's public key
// ---------------------------------------------------------------------------

/**
 * Seal `dataKey` so that only the holder of `recipientPublicKey` can open it.
 * Ephemeral ECDH -> HKDF-SHA256 -> AES-GCM.
 *
 * @param {Uint8Array} dataKey
 * @param {string} recipientPublicKey hex, compressed or uncompressed
 * @returns {Promise<{v:number, epk:string, iv:string, ct:string}>}
 */
export async function sealKey(dataKey, recipientPublicKey) {
  if (!recipientPublicKey) throw new Error("Recipient has no encryption public key registered");

  const ephPriv = secp.utils.randomPrivateKey();
  const ephPub = secp.getPublicKey(ephPriv, false);

  const shared = secp.getSharedSecret(ephPriv, fromHex(recipientPublicKey), true);
  // Drop the parity byte; HKDF over the x-coordinate.
  const aesRaw = hkdf(sha256, shared.slice(1), undefined, "medchain-ecies-v1", 32);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(aesRaw, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, dataKey));

  return { v: 1, epk: toHex(ephPub), iv: toB64(iv), ct: toB64(ct) };
}

/**
 * Open an envelope produced by sealKey.
 * @param {{epk:string, iv:string, ct:string}} sealed
 * @param {Uint8Array} privateKey
 * @returns {Promise<Uint8Array>} the recovered data key
 */
export async function unsealKey(sealed, privateKey) {
  if (!sealed || !sealed.epk) throw new Error("Malformed key envelope");

  const shared = secp.getSharedSecret(privateKey, fromHex(sealed.epk), true);
  const aesRaw = hkdf(sha256, shared.slice(1), undefined, "medchain-ecies-v1", 32);

  const key = await importAesKey(aesRaw, ["decrypt"]);
  try {
    const out = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(sealed.iv) },
      key,
      fromB64(sealed.ct)
    );
    return new Uint8Array(out);
  } catch {
    throw new Error("Could not unseal the record key - it was not sealed for this wallet");
  }
}

// ---------------------------------------------------------------------------
// File validation (step 2 of the security flow)
// ---------------------------------------------------------------------------

export const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** @returns {{ok:boolean, error?:string}} */
export function validateFile(file) {
  if (!file) return { ok: false, error: "Choose a file first" };
  if (file.size === 0) return { ok: false, error: "That file is empty" };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `File is ${formatBytes(file.size)} - the limit is 15 MB` };
  }
  const type = file.type || "";
  const extOk = /\.(pdf|png|jpe?g|webp|txt|csv|json|docx?)$/i.test(file.name);
  if (type && !ALLOWED_TYPES.includes(type) && !extOk) {
    return { ok: false, error: `Unsupported file type: ${type || "unknown"}` };
  }
  return { ok: true };
}

export function formatBytes(n) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
