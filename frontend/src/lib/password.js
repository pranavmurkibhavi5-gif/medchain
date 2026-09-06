/**
 * Password strength and validation.
 *
 * Deliberately pure and free of network calls, because in this system the
 * password is not merely a login: it derives the key that opens the user's
 * wallet vault. A weak one is the weakest link in the whole design, which is
 * why the meter is honest rather than flattering - length carries most of the
 * weight, and common passwords are pushed back down regardless of length.
 */

/** Passwords seen constantly in breach corpora. Kept short and obvious. */
const COMMON = [
  "password", "12345678", "123456789", "qwerty", "abc123", "111111",
  "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon",
  "sunshine", "princess", "football", "password1", "qwerty123",
];

export const MIN_LENGTH = 8;

export const STRENGTH = [
  { label: "password.veryWeak", tone: "bg-rose-500", text: "text-rose-600" },
  { label: "password.weak", tone: "bg-rose-400", text: "text-rose-600" },
  { label: "password.fair", tone: "bg-amber-400", text: "text-amber-600" },
  { label: "password.good", tone: "bg-emerald-400", text: "text-emerald-600" },
  { label: "password.strong", tone: "bg-emerald-600", text: "text-emerald-700" },
];

/**
 * Score a password from 0 (very weak) to 4 (strong).
 *
 * @param {string} password
 * @returns {{score: number, length: number, hasLower: boolean, hasUpper: boolean,
 *            hasDigit: boolean, hasSymbol: boolean, common: boolean}}
 */
export function scorePassword(password = "") {
  const pw = String(password);
  const length = pw.length;

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);

  const lower = pw.toLowerCase();
  // Catches "password", "Password1", "letmein!!" and similar.
  const common = COMMON.some((c) => lower.includes(c));

  if (length === 0) {
    return { score: 0, length, hasLower, hasUpper, hasDigit, hasSymbol, common: false };
  }

  let score = 0;
  if (length >= MIN_LENGTH) score += 1;
  if (length >= 12) score += 1;
  if (length >= 16) score += 1;

  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes >= 3) score += 1;

  // A long passphrase beats a short scramble, but neither survives being a
  // known password.
  if (common) score = Math.min(score, 1);
  if (length < MIN_LENGTH) score = Math.min(score, 1);

  return {
    score: Math.max(0, Math.min(4, score)),
    length,
    hasLower,
    hasUpper,
    hasDigit,
    hasSymbol,
    common,
  };
}

/**
 * Why a password cannot be used yet. Returns an i18n key, or "" when it is
 * acceptable. Order matters: report the most fixable problem first.
 */
export function passwordProblem(password = "", confirm = null, current = null) {
  const pw = String(password);

  if (!pw) return "password.errRequired";
  if (pw.length < MIN_LENGTH) return "password.errShort";

  const { common } = scorePassword(pw);
  if (common) return "password.errCommon";

  if (current !== null && pw === String(current)) return "password.errSame";
  if (confirm !== null && pw !== String(confirm)) return "password.errMismatch";

  return "";
}
