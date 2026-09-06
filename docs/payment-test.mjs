/**
 * Consultation fees and UPI links.
 *
 * The claim being defended here is a negative one: the app never asserts that
 * a payment succeeded. A static UPI address has no callback, so "claimed"
 * means the patient said so and "confirmed" means the doctor saw the money.
 * These assertions pin down the amount formatting, the link the QR encodes,
 * and the fact that a claim is never dressed up as a confirmation.
 */
import {
  PAYMENT_STATUS,
  formatFee,
  isPayable,
  isValidUpiId,
  paymentSummary,
  upiLink,
} from "../frontend/src/lib/payments.js";

let pass = 0;
let fail = 0;
const ok = (m, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${m}${extra ? ` - ${extra}` : ""}`);
};
const sec = (s) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

const CATALOGUE = {
  "payment.dueOf": "{fee} due",
  "payment.claimedOf": "{fee} - waiting for the doctor to confirm",
  "payment.confirmedOf": "{fee} received",
  "payment.statusWaived": "Fee waived",
};
const t = (key, vars = {}) =>
  Object.entries(vars).reduce((a, [k, v]) => a.replace(`{${k}}`, v), CATALOGUE[key] || key);

console.log("\nConsultation fees and UPI\n" + "=".repeat(25));

sec("1. UPI IDs");
ok("a normal one is accepted", isValidUpiId("rakesh@okaxis"));
ok("digits and dots are fine", isValidUpiId("rakesh.patil24@ybl"));
ok("a phone-style handle works", isValidUpiId("9900000000@paytm"));
ok("no handle is rejected", !isValidUpiId("rakesh"));
ok("an email is not a UPI ID", !isValidUpiId("rakesh@gmail..com"));
ok("empty is rejected", !isValidUpiId(""));
ok("spaces are rejected", !isValidUpiId("rakesh patil@okaxis"));

sec("2. Fee formatting");
ok("whole rupees with a symbol", formatFee(250) === "₹250", formatFee(250));
ok("one rupee reads correctly", formatFee(1) === "₹1", formatFee(1));
ok("zero shows nothing at all", formatFee(0) === "");
ok("blank shows nothing", formatFee("") === "");
ok("thousands are grouped", formatFee(1500).includes("1,500"), formatFee(1500));

sec("3. The link a QR encodes");
const link = upiLink({ vpa: "rakesh@okaxis", name: "Dr Garag", amount: 1, note: "Consultation" });
ok("uses the upi scheme", link.startsWith("upi://pay?"), link);
ok("carries the payee address", link.includes("pa=rakesh%40okaxis"));
ok("carries the amount to two places", link.includes("am=1.00"));
ok("declares rupees", link.includes("cu=INR"));
ok("carries the payee name", link.includes("pn=Dr+Garag") || link.includes("pn=Dr%20Garag"));

let rejected = false;
try {
  upiLink({ vpa: "not-a-upi-id", amount: 1 });
} catch {
  rejected = true;
}
ok("refuses to build a link from a bad address", rejected);

const noAmount = upiLink({ vpa: "rakesh@okaxis" });
ok("omits the amount when there is none", !noAmount.includes("am="));

sec("4. A claim is never a confirmation");
ok("all four states have styling", Object.keys(PAYMENT_STATUS).length === 4);
ok(
  "claimed and confirmed are different states",
  PAYMENT_STATUS.claimed.label !== PAYMENT_STATUS.confirmed.label
);

const unpaid = { payment: { amount: 1, status: "none" } };
const claimed = { payment: { amount: 1, status: "claimed" } };
const confirmed = { payment: { amount: 1, status: "confirmed" } };
const waived = { payment: { amount: 1, status: "waived" } };
const free = { payment: { amount: 0, status: "none" } };

ok("an unpaid fee reads as due", paymentSummary(unpaid, t) === "₹1 due");
ok(
  "a claim says it is waiting on the doctor",
  paymentSummary(claimed, t).includes("waiting for the doctor")
);
ok("only a confirmation says received", paymentSummary(confirmed, t) === "₹1 received");
ok("a claim never says received", !paymentSummary(claimed, t).includes("received"));
ok("a waived fee says so", paymentSummary(waived, t) === "Fee waived");
ok("a free appointment says nothing", paymentSummary(free, t) === "");

sec("5. When payment is still outstanding");
ok("unpaid is payable", isPayable(unpaid));
ok("claimed is still payable until confirmed", isPayable(claimed));
ok("confirmed is not payable", !isPayable(confirmed));
ok("waived is not payable", !isPayable(waived));
ok("a free appointment is not payable", !isPayable(free));
ok("a missing payment block is not payable", !isPayable({}));

console.log("\n" + "=".repeat(25));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(25) + "\n");
process.exit(fail ? 1 : 0);
