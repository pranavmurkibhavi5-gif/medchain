/**
 * Doctor directory and avatar helpers.
 *
 * Small pure functions, but they decide what a patient sees when choosing who
 * to trust with their medical records, so they are worth pinning down: an
 * experience label must not invent years that were never entered, and the
 * fallback avatar must be stable rather than flickering between colours.
 */
import {
  SPECIALIZATIONS,
  experienceLabel,
  expertiseList,
  iconFor,
} from "../frontend/src/lib/doctors.js";
import { initials, tintFor, ACCEPTED, OUTPUT_SIZE } from "../frontend/src/lib/avatar.js";

let pass = 0;
let fail = 0;
const ok = (m, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${m}${extra ? ` - ${extra}` : ""}`);
};
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

// Stand-in for the translator: a tiny catalogue plus placeholder filling, so
// substitution is actually exercised rather than echoing the key back.
const CATALOGUE = { "doctor.yearsExperience": "{n} years experience" };
const t = (key, vars = {}) =>
  Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, v),
    CATALOGUE[key] || key
  );

console.log("\nDoctor directory helpers\n" + "=".repeat(24));

sec("1. Specializations");
ok("all twelve are offered", SPECIALIZATIONS.length === 12, String(SPECIALIZATIONS.length));
ok("no duplicates", new Set(SPECIALIZATIONS).size === SPECIALIZATIONS.length);
ok("includes Cardiologist", SPECIALIZATIONS.includes("Cardiologist"));
ok("includes General Physician", SPECIALIZATIONS.includes("General Physician"));
ok("every one has an icon", SPECIALIZATIONS.every((s) => iconFor(s) !== "" ));
ok("an unknown specialization still gets an icon", iconFor("Rheumatologist") === "🩺");

sec("2. Experience label");
ok("blank experience shows nothing", experienceLabel("", t) === "");
ok("zero shows nothing rather than '0 years'", experienceLabel(0, t) === "");
ok("undefined shows nothing", experienceLabel(undefined, t) === "");
ok("a real number is rendered", experienceLabel(12, t) === "12 years experience", experienceLabel(12, t));
ok("a string number works too", experienceLabel("7", t) === "7 years experience");

sec("3. Expertise list");
ok("an array passes through", expertiseList(["ECG", "Angio"]).length === 2);
ok("a comma-separated string splits", expertiseList("ECG, Angio, Holter").length === 3);
ok("whitespace is trimmed", expertiseList(" ECG ,  Angio ")[0] === "ECG");
ok("empty entries are dropped", expertiseList("ECG,,Angio,").length === 2);
ok("blank input gives an empty list", expertiseList("").length === 0);
ok("undefined gives an empty list", expertiseList(undefined).length === 0);

sec("4. Fallback avatar");
ok("two names give two initials", initials("Afziya Garag") === "AG");
ok("one name gives two letters", initials("Sudeep") === "SU");
ok("extra middle names are ignored", initials("A B C Kalkeri") === "AK");
ok("spacing does not matter", initials("  Afziya   Garag  ") === "AG");
ok("an empty name is handled", initials("") === "?");
ok("initials are upper case", initials("afziya garag") === "AG");

const seed = "0xAE246FCcad4F7aF88C1c6B3d17FaF2105D345824";
ok("the tint is stable for one person", tintFor(seed) === tintFor(seed));
ok("different people can differ", new Set(["a", "b", "c", "d", "e", "f", "g"].map(tintFor)).size > 1);
ok("an empty seed still returns a class", tintFor("").length > 0);

sec("5. Upload constraints");
ok("only web-safe image types are accepted", ACCEPTED.every((m) => m.startsWith("image/")));
ok("SVG is not accepted", !ACCEPTED.includes("image/svg+xml"));
ok("output is a small square", OUTPUT_SIZE === 256);

console.log("\n" + "=".repeat(24));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(24) + "\n");
process.exit(fail ? 1 : 0);
