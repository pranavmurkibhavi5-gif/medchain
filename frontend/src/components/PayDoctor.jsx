/**
 * Paying a doctor's consultation fee by UPI.
 *
 * The honest constraint, stated on screen as well as here: a static UPI
 * address has no callback, so this app cannot know whether money arrived. It
 * therefore never says "Paid". The patient states they have paid, which is
 * recorded as a claim, and the doctor - who can actually see their own UPI app
 * - confirms it. That confirmation is the verification.
 *
 * The QR is either the doctor's uploaded image from their bank, or one drawn
 * here from the UPI ID they entered. On a phone the pay button opens their UPI
 * app directly, which is where a PIN is entered and nowhere else.
 */
import { useEffect, useRef, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { formatFee, isValidUpiId, upiLink } from "../lib/payments";
import { Spinner } from "./ui";

export default function PayDoctor({ appointment, doctor, onPaid }) {
  const { notify } = useApp();
  const t = useT();

  const canvasRef = useRef(null);
  const [qrImage, setQrImage] = useState(null);
  const [busy, setBusy] = useState(false);

  const amount = Number(appointment?.payment?.amount || 0);
  const vpa = doctor?.upiId || "";
  const link = isValidUpiId(vpa)
    ? upiLink({
        vpa,
        name: doctor?.name || "",
        amount,
        note: t("payment.noteFor", { name: doctor?.name || "" }),
      })
    : "";

  // Prefer the doctor's own uploaded QR; otherwise draw one from their UPI ID.
  useEffect(() => {
    let cancelled = false;

    if (doctor?.hasPaymentQr && doctor?.walletAddress) {
      api
        .paymentQrBytes(doctor.walletAddress)
        .then(({ buffer, headers }) => {
          if (cancelled) return;
          const type = headers.get("Content-Type") || "image/png";
          setQrImage(URL.createObjectURL(new Blob([buffer], { type })));
        })
        .catch(() => !cancelled && setQrImage(null));
      return () => {
        cancelled = true;
      };
    }

    if (!link || !canvasRef.current) return undefined;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        if (!cancelled && canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, link, {
            width: 210,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
        }
      } catch (err) {
        console.error("[payment] could not draw QR:", err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctor, link]);

  const claim = async () => {
    setBusy(true);
    try {
      await api.setAppointmentPayment(appointment.id, { status: "claimed" });
      notify(t("payment.claimSent"), "success");
      onPaid?.();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!amount) return null;

  const noAddress = !vpa && !doctor?.hasPaymentQr;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-900">{t("payment.title")}</h3>
        <span className="text-xl font-extrabold text-slate-900">{formatFee(amount)}</span>
      </div>

      {noAddress ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("payment.noAddress")}
        </p>
      ) : (
        <>
          <div className="flex justify-center">
            {qrImage ? (
              <img
                src={qrImage}
                alt={t("payment.scanAlt")}
                className="h-52 w-52 rounded-xl border border-slate-200 object-contain p-1"
              />
            ) : (
              <canvas ref={canvasRef} className="rounded-xl border border-slate-200 p-1" />
            )}
          </div>

          {vpa && (
            <p className="text-center font-mono text-xs text-slate-500">{vpa}</p>
          )}

          <p className="text-center text-sm text-slate-600">{t("payment.scanHint")}</p>

          {link && (
            <a href={link} className="btn-primary w-full">
              {t("payment.openUpiApp")}
            </a>
          )}

          <button onClick={claim} disabled={busy} className="btn-ghost w-full border border-slate-200">
            {busy ? <Spinner className="h-4 w-4" /> : t("payment.iHavePaid")}
          </button>

          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {t("payment.honestyNote")}
          </p>
        </>
      )}
    </div>
  );
}
