/**
 * Account recovery.
 *
 * The password derives the key to a patient's records, so forgetting it would
 * otherwise destroy them permanently. A recovery key fixes that without
 * handing anything to the server: it seals a SECOND copy of the same wallet
 * key under a high-entropy code that only the user holds.
 *
 * Two sealed copies, two secrets, one key inside:
 *
 *     password ──PBKDF2──> vault          ──┐
 *                                            ├──> wallet private key
 *     recovery code ──PBKDF2──> recoveryVault ┘
 *
 * The server stores both sealed blobs and can open neither. Recovering means
 * opening the second one and re-sealing the first under a new password.
 *
 * No new cryptography: this reuses reseal() and openVault() from wallet.js,
 * which are already in use and already tested.
 */
import { openVault, reseal } from "./wallet.js";

/**
 * Crockford-style base32, with the characters people misread removed:
 * no I, L, O or U. 20 characters gives about 100 bits of entropy, which is
 * far beyond guessing and still short enough to write on paper.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 20;
const GROUP = 4;

/** Generate a fresh recovery code, formatted for reading aloud. */
export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  let raw = "";
  for (const b of bytes) raw += ALPHABET[b % ALPHABET.length];
  return formatCode(raw);
}

/** "ABCD-EFGH-..." from a bare string. */
export function formatCode(raw) {
  return (raw.match(new RegExp(`.{1,${GROUP}}`, "g")) || []).join("-");
}

/**
 * Accept what a human typed.
 *
 * Case is ignored, dashes and spaces are ignored, and the characters most
 * often confused are folded to the ones actually in the alphabet - someone
 * reading their own handwriting should not be locked out over an O and a 0.
 */
export function normaliseCode(input = "") {
  return String(input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/** A code is usable only when it is the right length and in the alphabet. */
export function isValidCode(input) {
  const code = normaliseCode(input);
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

/**
 * Seal the wallet key under a newly generated recovery code.
 *
 * @returns {Promise<{code: string, vault: object, salt: string}>}
 *          `code` is shown to the user once and never stored anywhere.
 */
export async function createRecovery(privateKey) {
  const code = generateRecoveryCode();
  const { vault, salt } = await reseal(privateKey, normaliseCode(code));
  return { code, vault, salt };
}

/**
 * Open the recovery vault with a code the user typed.
 * @throws with code "WRONG_CODE" when it does not open.
 */
export async function openRecovery(code, vault, salt) {
  try {
    return await openVault(normaliseCode(code), vault, salt);
  } catch {
    const err = new Error("WRONG_CODE");
    err.code = "WRONG_CODE";
    throw err;
  }
}

/** Plain-text file contents, for the user to save or print. */
export function recoverySheet(code, email) {
  return [
    "MedChain account recovery key",
    "=============================",
    "",
    `Account: ${email}`,
    `Created: ${new Date().toLocaleString()}`,
    "",
    "Recovery key:",
    "",
    `    ${code}`,
    "",
    "Keep this somewhere safe and private, on paper if possible.",
    "",
    "It can restore access to your medical records if you forget your",
    "password. Anyone who has it can also take over your account, so do",
    "not store it in the same place as your password.",
    "",
    "Nobody can recover your records for you if both are lost. Not the",
    "hospital, not the developers, not anyone.",
    "",
  ].join("\n");
}
