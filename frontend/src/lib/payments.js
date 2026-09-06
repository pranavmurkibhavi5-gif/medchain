/**
 * Consultation fees, paid by UPI.
 *
 * A deliberate design decision runs through this file: **the app never claims
 * a payment succeeded.**
 *
 * A static UPI address has no callback, no webhook and no API. Nothing here
 * can confirm that money arrived - so nothing here pretends to. The patient
 * says they have paid, and that is recorded as a *claim*; the doctor checks
 * their own UPI app and confirms, and only then is the payment marked
 * confirmed. The doctor's confirmation is the verification, which is exactly
 * true and matches how a small clinic actually works.
 *
 * The doctor's UPI address is theirs, entered by them, and shown only to a
 * patient booking with them. No payment address is hardcoded anywhere.
 *
 * Nothing about payment goes on the blockchain. A permanent public record of
 * who paid which specialist would be worse than useless.
 */

export const PAYMENT_STATUS = {
  none: { label: "payment.statusNone", tone: "bg-slate-100 text-slate-600 border-slate-200" },
  claimed: { label: "payment.statusClaimed", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  confirmed: {
    label: "payment.statusConfirmed",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  waived: { label: "payment.statusWaived", tone: "bg-slate-100 text-slate-600 border-slate-200" },
};

/**
 * UPI IDs look like name@bank.
 *
 * The handle after @ is alphanumeric - okaxis, ybl, paytm, okhdfcbank - which
 * is what separates a UPI ID from an email address. Accepting an email would
 * be worse than rejecting an unusual handle: validation would pass, and the
 * payment would then fail inside the user's UPI app with no explanation.
 */
export function isValidUpiId(value = "") {
  const v = String(value).trim();
  if (!v || v.includes("..")) return false;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9.\-_]{0,62}[a-zA-Z0-9])?@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v);
}

/** "₹250" - whole rupees, because consultation fees are not priced in paise. */
export function formatFee(amount) {
  const n = Number(amount || 0);
  if (!n) return "";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * A UPI intent link. Opening it hands the payment to the user's own UPI app,
 * which is the only place their PIN is ever entered.
 *
 * @param {{vpa: string, name?: string, amount?: number, note?: string}} to
 */
export function upiLink({ vpa, name = "", amount = 0, note = "" }) {
  if (!isValidUpiId(vpa)) throw new Error("That UPI ID does not look right");

  const params = new URLSearchParams();
  params.set("pa", String(vpa).trim());
  if (name) params.set("pn", name);
  if (Number(amount) > 0) params.set("am", Number(amount).toFixed(2));
  params.set("cu", "INR");
  if (note) params.set("tn", note.slice(0, 50));

  return `upi://pay?${params.toString()}`;
}

/** Is a fee actually being asked for on this appointment? */
export const isPayable = (appointment) =>
  Number(appointment?.payment?.amount || 0) > 0 &&
  ["none", "claimed"].includes(appointment?.payment?.status || "none");

/** What the patient still owes, in words the UI can use directly. */
export function paymentSummary(appointment, t) {
  const p = appointment?.payment;
  if (!p || !Number(p.amount)) return "";
  const fee = formatFee(p.amount);

  switch (p.status) {
    case "confirmed":
      return t("payment.confirmedOf", { fee });
    case "claimed":
      return t("payment.claimedOf", { fee });
    case "waived":
      return t("payment.statusWaived");
    default:
      return t("payment.dueOf", { fee });
  }
}
