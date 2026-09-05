/**
 * Camera QR scanner.
 *
 * Decoding runs in JavaScript (jsQR) rather than through the platform's
 * BarcodeDetector, which exists on Android but not on desktop Chrome. One code
 * path means the doctor gets the same behaviour on a phone and on a laptop.
 *
 * The video stream never leaves the device and is not recorded: frames are
 * sampled to an off-screen canvas, decoded, and discarded.
 */
import { useEffect, useRef, useState } from "react";

import { useT } from "../i18n";
import { Modal, Spinner } from "./ui";

export default function QrScanner({ open, onClose, onResult }) {
  const t = useT();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [state, setState] = useState("starting"); // starting | scanning | denied | unsupported

  useEffect(() => {
    if (!open) return undefined;

    let stream = null;
    let raf = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      let jsQR;
      try {
        jsQR = (await import("jsqr")).default;
      } catch {
        setState("unsupported");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch (err) {
        console.warn("[qr] camera unavailable:", err.name);
        setState("denied");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => {});
      setState("scanning");

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        if (stopped) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          // Sample at a modest size: decoding a full 1080p frame every tick
          // makes an older phone stutter, and a QR code survives downscaling.
          const w = 480;
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);

          const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, {
            inversionAttempts: "dontInvert",
          });
          if (found?.data) {
            stop();
            onResult(found.data.trim());
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return stop;
  }, [open, onResult]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("qr.scanTitle")}
      footer={
        <button onClick={onClose} className="btn-primary">
          {t("common.cancel")}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          {/* Kept mounted so the ref exists before the stream attaches. */}
          <video ref={videoRef} className="block max-h-[50vh] w-full object-cover" muted />
          <canvas ref={canvasRef} className="hidden" />

          {state === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-44 w-44 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="h-7 w-7 text-white" />
            </div>
          )}
        </div>

        {state === "scanning" && (
          <p className="text-center text-sm text-slate-600">{t("qr.scanHint")}</p>
        )}
        {state === "denied" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t("qr.cameraDenied")}
          </p>
        )}
        {state === "unsupported" && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {t("qr.cameraUnsupported")}
          </p>
        )}
      </div>
    </Modal>
  );
}
