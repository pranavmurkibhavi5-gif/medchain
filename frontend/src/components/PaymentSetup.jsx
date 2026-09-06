/**
 * A doctor's consultation fee and how patients pay them.
 *
 * Either a UPI ID, from which the app draws a QR, or the doctor's own scanner
 * image uploaded from their bank. Both are published to patients booking with
 * them, which is why the screen says so plainly - a payment address is
 * personal, and publishing it should be a deliberate act.
 *
 * Leaving the fee at zero keeps consultations free, and the booking flow skips
 * payment entirely.
 */
import { useEffect, useRef, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { ACCEPTED, prepareAvatar } from "../lib/avatar";
import { formatFee, isValidUpiId } from "../lib/payments";

export default function PaymentSetup() {
  const { user, notify, refreshUser } = useApp();
  const t = useT();
  const fileRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState("");
  const [upi, setUpi] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setFee(user.consultationFee ? String(user.consultationFee) : "");
    setUpi(user.upiId || "");
  }, [user]);

  const save = async () => {
    const trimmed = upi.trim();
    if (trimmed && !isValidUpiId(trimmed)) {
      setError(t("payment.badUpi"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      await api.updateProfile({
        consultationFee: Number(fee || 0),
        upiId: trimmed,
      });
      await refreshUser();
      setDirty(false);
      notify(t("payment.saved"), "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadQr = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError("");
    try {
      // Reuses the avatar pipeline: resized and re-encoded in the browser, so
      // a photographed scanner does not arrive as several megabytes.
      const prepared = await prepareAvatar(file);
      await api.putPaymentQr({ data: prepared.data, type: prepared.type });
      await refreshUser();
      notify(t("payment.qrSaved"), "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeQr = async () => {
    setBusy(true);
    try {
      await api.deletePaymentQr();
      await refreshUser();
      notify(t("payment.qrRemoved"), "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-left">
          <span className="block font-semibold text-slate-900">💳 {t("payment.setupTitle")}</span>
          <span className="block text-xs text-slate-500">
            {Number(user?.consultationFee) > 0
              ? t("payment.feeIs", { fee: formatFee(user.consultationFee) })
              : t("payment.freeConsult")}
          </span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("payment.fee")}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              className="input-lg"
              placeholder="0"
              value={fee}
              onChange={(e) => {
                setFee(e.target.value);
                setDirty(true);
              }}
            />
            <span className="mt-1 block text-xs text-slate-400">{t("payment.feeHint")}</span>
          </label>

          {/* One-tap amounts. ₹1 is there so a demo can charge something real
              without charging anyone anything meaningful. */}
          <div className="flex flex-wrap gap-2">
            {[0, 1, 100, 250, 500].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setFee(String(amount));
                  setDirty(true);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  String(amount) === String(fee || 0)
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                }`}
              >
                {amount === 0 ? t("payment.free") : formatFee(amount)}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("payment.upiId")}
            </span>
            <input
              className="input-lg"
              placeholder="yourname@bank"
              value={upi}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => {
                setUpi(e.target.value);
                setDirty(true);
              }}
            />
            <span className="mt-1 block text-xs text-slate-400">{t("payment.upiHint")}</span>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">{t("payment.orScanner")}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t("payment.scannerHint")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="btn-ghost btn-sm"
              >
                {user?.hasPaymentQr ? t("payment.replaceQr") : t("payment.uploadQr")}
              </button>
              {user?.hasPaymentQr && (
                <button onClick={removeQr} disabled={busy} className="btn-ghost btn-sm text-rose-600">
                  {t("payment.removeQr")}
                </button>
              )}
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            onChange={uploadQr}
            className="hidden"
          />

          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            ⚠️ {t("payment.publicNote")}
          </p>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            onClick={save}
            disabled={busy || !dirty}
            className="btn-primary w-full disabled:opacity-50"
          >
            {busy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      )}
    </section>
  );
}
