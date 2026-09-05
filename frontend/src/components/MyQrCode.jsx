/**
 * The patient's MedChain ID, as a QR code.
 *
 * A doctor scans it instead of typing a 42-character wallet address, which is
 * where mistakes happen. The code carries only the patient's public blockchain
 * address - the same string already visible on the explorer. No medical data,
 * no key material, nothing private is encoded here.
 *
 * Scanning grants nothing on its own. The doctor still has to send a request
 * and the patient still has to approve it on-chain.
 */
import { useEffect, useRef, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";

export const QR_PREFIX = "medchain:";

/** Pull an Ethereum address out of a scanned string, or return "". */
export function addressFromQr(text = "") {
  const cleaned = String(text).trim().replace(new RegExp(`^${QR_PREFIX}`, "i"), "");
  return /^0x[0-9a-fA-F]{40}$/.test(cleaned) ? cleaned : "";
}

export default function MyQrCode() {
  const { address, user } = useApp();
  const t = useT();
  const canvasRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !address) return;
    let cancelled = false;

    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, `${QR_PREFIX}${address}`, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0f172a", light: "#ffffff" },
        });
      } catch (err) {
        console.error("[qr] could not render:", err.message);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, address]);

  if (!address) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-left">
          <span className="block font-semibold text-slate-900">🔳 {t("qr.myId")}</span>
          <span className="block text-xs text-slate-500">{t("qr.myIdHint")}</span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="flex flex-col items-center border-t border-slate-100 px-5 py-5">
          {failed ? (
            <p className="text-sm text-slate-500">{t("errors.generic")}</p>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <canvas ref={canvasRef} />
            </div>
          )}

          <p className="mt-3 text-center font-semibold text-slate-900">{user?.name}</p>
          <p className="mt-1 break-all text-center font-mono text-[11px] text-slate-500">
            {address}
          </p>
          <p className="mt-3 text-center text-xs text-slate-500">{t("qr.myIdSafe")}</p>
        </div>
      )}
    </section>
  );
}
