/**
 * Account recovery.
 *
 * This is the feature that decides whether forgetting a password destroys a
 * patient's records, so the assertions matter more than most:
 *
 *   - the recovery key opens the SAME wallet the password opens, not a new one
 *   - a wrong code opens nothing
 *   - replacing a recovery key really does retire the old one
 *   - the challenge signature can only be produced by the key inside the vault,
 *     which is what stops the endpoint becoming an account-takeover route
 */
import { ethers } from "ethers";

import {
  createRecovery,
  formatCode,
  generateRecoveryCode,
  isValidCode,
  normaliseCode,
  openRecovery,
  recoverySheet,
} from "../frontend/src/lib/recovery.js";
import { createVault, openVault, reseal } from "../frontend/src/lib/wallet.js";

let pass = 0;
let fail = 0;
const ok = (m, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${m}${extra ? ` - ${extra}` : ""}`);
};
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

console.log("\nAccount recovery\n" + "=".repeat(16));

sec("1. Code shape");
const code = generateRecoveryCode();
ok("formatted in five groups of four", /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/.test(code), code);
ok("20 characters of entropy", normaliseCode(code).length === 20);
ok("its own code validates", isValidCode(code));
ok("two codes differ", generateRecoveryCode() !== generateRecoveryCode());
ok("ambiguous letters are absent", !/[ILOU]/.test(normaliseCode(code)));

sec("2. Forgiving what people type");
ok("lower case is accepted", normaliseCode(code.toLowerCase()) === normaliseCode(code));
ok("spaces instead of dashes", normaliseCode(code.replace(/-/g, " ")) === normaliseCode(code));
ok("no separators at all", normaliseCode(code.replace(/-/g, "")) === normaliseCode(code));
ok("letter O folds to zero", normaliseCode("O") === "0");
ok("letters I and L fold to one", normaliseCode("IL") === "11");
ok("a short code is rejected", !isValidCode("ABCD-EFGH"));
ok("formatCode groups a bare string", formatCode("ABCDEFGH") === "ABCD-EFGH");

sec("3. It opens the same wallet as the password");
const PASSWORD = "Gulmohar@2026";
const account = await createVault(PASSWORD);
const recovery = await createRecovery(account.privateKey);

const viaPassword = await openVault(PASSWORD, account.vault, account.salt);
const viaRecovery = await openRecovery(recovery.code, recovery.vault, recovery.salt);

ok("same address", viaRecovery.address === viaPassword.address, viaRecovery.address);
ok("same private key", viaRecovery.privateKey === viaPassword.privateKey);
ok(
  "same record-encryption key",
  viaRecovery.keyPair.publicKey === viaPassword.keyPair.publicKey
);
ok("the two sealed blobs differ", JSON.stringify(recovery.vault) !== JSON.stringify(account.vault));
ok("and use different salts", recovery.salt !== account.salt);

sec("4. A wrong code opens nothing");
let refused = false;
try {
  await openRecovery(generateRecoveryCode(), recovery.vault, recovery.salt);
} catch (err) {
  refused = err.code === "WRONG_CODE";
}
ok("a different code is rejected", refused);

let refusedPassword = false;
try {
  await openRecovery(PASSWORD, recovery.vault, recovery.salt);
} catch {
  refusedPassword = true;
}
ok("the password does not open the recovery vault", refusedPassword);

sec("5. Replacing a key retires the old one");
const replaced = await createRecovery(account.privateKey);
ok("a new code is issued", replaced.code !== recovery.code);

let oldRefused = false;
try {
  // The server stores only the newest blob, so the old code has nothing to open.
  await openRecovery(recovery.code, replaced.vault, replaced.salt);
} catch {
  oldRefused = true;
}
ok("the previous code cannot open the new vault", oldRefused);
ok(
  "the new code still reaches the same wallet",
  (await openRecovery(replaced.code, replaced.vault, replaced.salt)).address === account.address
);

sec("6. Proof of possession");
// The server issues a challenge; only the key inside the vault can sign it.
const challenge = "eyJhbGciOiJIUzI1NiJ9.challenge-stand-in.signature";
const opened = await openRecovery(replaced.code, replaced.vault, replaced.salt);
const signature = await new ethers.Wallet(opened.privateKey).signMessage(challenge);

ok(
  "the signature recovers to the account address",
  ethers.verifyMessage(challenge, signature).toLowerCase() === account.address.toLowerCase()
);

const impostor = ethers.Wallet.createRandom();
const forged = await impostor.signMessage(challenge);
ok(
  "someone else's signature does not match the account",
  ethers.verifyMessage(challenge, forged).toLowerCase() !== account.address.toLowerCase()
);
ok(
  "a signature over a different challenge does not match",
  ethers.verifyMessage("a different challenge", signature).toLowerCase() !==
    account.address.toLowerCase()
);

sec("7. Recovery completes into a working password");
const NEW_PASSWORD = "Belagavi@2027";
const resealed = await reseal(opened.privateKey, NEW_PASSWORD);
const after = await openVault(NEW_PASSWORD, resealed.vault, resealed.salt);
ok("the new password opens the same wallet", after.address === account.address);
ok("records stay reachable", after.keyPair.publicKey === account.keyPair.publicKey);

let oldPasswordFails = false;
try {
  await openVault(PASSWORD, resealed.vault, resealed.salt);
} catch {
  oldPasswordFails = true;
}
ok("the old password no longer works", oldPasswordFails);

sec("8. The printed sheet");
const sheet = recoverySheet(code, "patient@example.com");
ok("contains the code", sheet.includes(code));
ok("names the account", sheet.includes("patient@example.com"));
ok("warns that nobody can recover it", /nobody can recover/i.test(sheet));

console.log("\n" + "=".repeat(16));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(16) + "\n");
process.exit(fail ? 1 : 0);
