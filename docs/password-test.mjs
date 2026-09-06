/**
 * Password strength and validation.
 *
 * These matter more here than in an ordinary app: the password derives the key
 * that opens the user's wallet vault, so the meter must not flatter a weak
 * choice, and the validator must not let one through.
 */
import {
  MIN_LENGTH,
  STRENGTH,
  passwordProblem,
  scorePassword,
} from "../frontend/src/lib/password.js";

let pass = 0;
let fail = 0;
const ok = (m, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${m}${extra ? ` - ${extra}` : ""}`);
};
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

console.log("\nPassword strength and validation\n" + "=".repeat(33));

sec("1. Scoring");
ok("empty scores zero", scorePassword("").score === 0);
ok("short scores at most 1", scorePassword("Ab1!").score <= 1, String(scorePassword("Ab1!").score));
ok(
  "eight mixed characters is not called strong",
  scorePassword("Ab1!cdef").score < 4,
  String(scorePassword("Ab1!cdef").score)
);
ok(
  "a long passphrase scores well",
  scorePassword("correct horse battery staple").score >= 3,
  String(scorePassword("correct horse battery staple").score)
);
ok(
  "long and mixed scores highest",
  scorePassword("Tr0ub4dor&3xKq7vLm").score === 4,
  String(scorePassword("Tr0ub4dor&3xKq7vLm").score)
);
ok("score never exceeds the meter", STRENGTH.length === 5);

sec("2. Common passwords are pushed down");
ok("'password' is flagged", scorePassword("password").common === true);
ok("'Password1' is flagged despite mixing", scorePassword("Password1").common === true);
ok(
  "a long password containing a common word is still capped",
  scorePassword("mypasswordisverylongindeed").score <= 1,
  String(scorePassword("mypasswordisverylongindeed").score)
);
ok("an unrelated phrase is not flagged", scorePassword("gulmohar tree at dawn").common === false);

sec("3. Character classes are reported");
const s = scorePassword("Ab1!xyz");
ok("lower detected", s.hasLower === true);
ok("upper detected", s.hasUpper === true);
ok("digit detected", s.hasDigit === true);
ok("symbol detected", s.hasSymbol === true);
ok("no false symbol on plain letters", scorePassword("abcdefgh").hasSymbol === false);

sec("4. Validation");
ok("empty is rejected", passwordProblem("") === "password.errRequired");
ok("short is rejected", passwordProblem("Ab1!") === "password.errShort");
ok("common is rejected", passwordProblem("password123") === "password.errCommon");
ok(
  "mismatch is caught",
  passwordProblem("Gulmohar@2026", "Gulmohar@2025") === "password.errMismatch"
);
ok(
  "reusing the current password is caught",
  passwordProblem("Gulmohar@2026", "Gulmohar@2026", "Gulmohar@2026") === "password.errSame"
);
ok(
  "a good, matching, different password passes",
  passwordProblem("Gulmohar@2026", "Gulmohar@2026", "OldPass@2025") === ""
);

sec("5. Ordering of complaints");
// Length is the most actionable problem, so it must be reported before the
// mismatch a user has not finished typing yet.
ok(
  "length is reported before mismatch",
  passwordProblem("Ab1!", "somethingelse") === "password.errShort"
);
ok("minimum length is the documented one", MIN_LENGTH === 8);

console.log("\n" + "=".repeat(33));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(33) + "\n");
process.exit(fail ? 1 : 0);
