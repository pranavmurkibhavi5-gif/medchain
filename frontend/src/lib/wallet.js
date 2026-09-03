/**
 * Embedded (app-managed) wallet.
 *
 * WHY THIS EXISTS
 * ---------------
 * MedicalRecord.sol authorises by msg.sender: only the patient's own address
 * may upload a record or grant access. So every state change must be signed by
 * a key the user controls. Previously that key lived in MetaMask, which forced
 * ordinary patients to understand wallets, networks and gas.
 *
 * This module keeps the same on-chain security model but moves the key into the
 * app, so the patient only ever sees an email and a password.
 *
 * HOW IT WORKS
 * ------------
 *   password + per-user salt
 *      -> PBKDF2-SHA256 (310k iterations)      [in the browser]
 *      -> vault key
 *      -> AES-256-GCM decrypts the vault
 *      -> Ethereum private key + record-encryption keypair
 *
 * The server stores only the encrypted vault and the salt. It never receives
 * the password, the vault key, or any private key.
 *
 * HONEST SECURITY NOTE
 * --------------------
 * This is weaker than a hardware or extension wallet: the user's password is
 * now the root of their key material, so a weak password is the weak link, and
 * an attacker who steals the vault can attempt an offline guessing attack.
 * PBKDF2 with a high iteration count raises that cost but does not remove it.
 * This trade-off is deliberate and is documented in MOBILE.md - it buys an
 * interface an ordinary patient can actually use.
 */
import { ethers } from "ethers";
import { deriveKeyPairFromSignature, toB64, fromB64, KEY_DERIVATION_MESSAGE } from "./crypto.js";

const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 guidance for PBKDF2-SHA256
const VAULT_VERSION = 1;

/** Derive the vault key from the user's password. Never leaves the browser. */
async function deriveVaultKey(password, saltB64) {
  const salt = fromB64(saltB64);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Create a brand-new blockchain identity and seal it under the password.
 *
 * @returns {Promise<{vault: object, salt: string, address: string,
 *                    privateKey: string, keyPair: object}>}
 */
export async function createVault(password) {
  const wallet = ethers.Wallet.createRandom();
  const salt = newSalt();
  const key = await deriveVaultKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const payload = new TextEncoder().encode(
    JSON.stringify({ v: VAULT_VERSION, privateKey: wallet.privateKey })
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload)
  );

  return {
    vault: { v: VAULT_VERSION, iv: toB64(iv), ct: toB64(ct), iterations: PBKDF2_ITERATIONS },
    salt,
    address: wallet.address,
    privateKey: wallet.privateKey,
    keyPair: await deriveRecordKeys(wallet.privateKey),
  };
}

/**
 * Reopen an existing vault.
 * @throws if the password is wrong (AES-GCM authentication fails).
 */
export async function openVault(password, vault, salt) {
  const key = await deriveVaultKey(password, salt);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(vault.iv) },
      key,
      fromB64(vault.ct)
    );
  } catch {
    const err = new Error("WRONG_PASSWORD");
    err.code = "WRONG_PASSWORD";
    throw err;
  }

  const { privateKey } = JSON.parse(new TextDecoder().decode(plain));
  const wallet = new ethers.Wallet(privateKey);
  return {
    address: wallet.address,
    privateKey,
    keyPair: await deriveRecordKeys(privateKey),
  };
}

/**
 * The record-encryption keypair.
 *
 * Derived from a deterministic signature by the wallet key, exactly as the
 * MetaMask flow did - so records encrypted under the old scheme stay readable
 * and the sealing/unsealing code in crypto.js is unchanged.
 */
async function deriveRecordKeys(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const signature = await wallet.signMessage(KEY_DERIVATION_MESSAGE);
  return deriveKeyPairFromSignature(signature);
}

/**
 * A signer bound to the app's RPC, ready to send contract transactions.
 * No MetaMask, no popups, no network switching.
 *
 * Two details matter here.
 *
 * NonceManager: the app now owns transaction sequencing, a job MetaMask used
 * to do. Without it, two actions in quick succession (approve then revoke, or
 * two uploads) can both read the same pending nonce and the second is rejected
 * with "nonce has already been used". NonceManager keeps its own counter.
 *
 * Caching: the counter only helps if the same signer instance is reused, so
 * signers are memoised per key + endpoint rather than rebuilt per call.
 */
const signerCache = new Map();

export function makeSigner(privateKey, rpcUrl) {
  const cacheKey = `${privateKey}@${rpcUrl}`;
  const cached = signerCache.get(cacheKey);
  if (cached) return cached;

  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const signer = new ethers.NonceManager(new ethers.Wallet(privateKey, provider));
  signerCache.set(cacheKey, signer);
  return signer;
}

/** Drop cached signers, e.g. on sign-out. */
export function clearSigners() {
  signerCache.clear();
}

/** Change the password without changing the blockchain identity. */
export async function reseal(privateKey, newPassword) {
  const salt = newSalt();
  const key = await deriveVaultKey(newPassword, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(
    JSON.stringify({ v: VAULT_VERSION, privateKey })
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload)
  );
  return {
    vault: { v: VAULT_VERSION, iv: toB64(iv), ct: toB64(ct), iterations: PBKDF2_ITERATIONS },
    salt,
  };
}
