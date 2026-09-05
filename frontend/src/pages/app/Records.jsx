/**
 * Records list, used by both roles.
 *
 * A patient sees their own; a doctor sees those of a patient who approved
 * them. Opening a record runs the unchanged read path: fetch ciphertext,
 * verify the on-chain hash, unseal the key, decrypt in the browser.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/crypto";
import { openRecord, downloadBlob, isPreviewable } from "../../lib/records";
import { Spinner, Modal, formatDate } from "../../components/ui";
import PatientSummary from "../../components/PatientSummary";
import { EXPLORER } from "../../lib/web3";

export default function Records({ ownerAddress = null, title }) {
  const { keyPair, user, contract, notify } = useApp();
  const t = useT();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [active, setActive] = useState(null);
  const [opened, setOpened] = useState(null);
  const [showTech, setShowTech] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { records } = ownerAddress
        ? await api.patientRecords(ownerAddress)
        : await api.myRecords();
      setRecords(records);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [ownerAddress, notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => opened?.url && URL.revokeObjectURL(opened.url), [opened]);

  const open = async (record) => {
    setBusyId(record.recordId);
    setActive(record);
    setOpened(null);
    setShowTech(false);
    try {
      // A doctor's read is written to the audit trail on-chain.
      if (user?.role === "doctor") {
        const c = await contract();
        const tx = await c.logRecordAccess(BigInt(record.recordId));
        await tx.wait();
      }
      const { blob, meta } = await openRecord(record, keyPair);
      setOpened({ blob, meta, url: URL.createObjectURL(blob) });
      api.logAudit({
        action: "RECORD_DECRYPTED",
        recordId: record.recordId,
        target: record.owner,
        detail: `Opened "${record.fileName}"`,
      }).catch(() => {});
    } catch (err) {
      const m = String(err.message || "");
      setActive(null);
      if (m.includes("Integrity check FAILED")) notify(t("errors.integrity"), "error");
      else if (m.includes("Access denied")) notify(t("errors.notAuthorised"), "error");
      else notify(t("errors.generic"), "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">{title || t("records.title")}</h1>
        {!ownerAddress && (
          <Link to="/app/upload" className="btn-primary btn-sm shrink-0">
            ＋
          </Link>
        )}
      </div>

      {/* Who the doctor is treating. Renders nothing for the patient's own
          list, and nothing when no profile has been shared. */}
      {ownerAddress && <PatientSummary patientAddress={ownerAddress} />}

      {records.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">📁</div>
          <p className="mt-3 font-semibold text-slate-800">{t("records.empty")}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{t("records.emptyHint")}</p>
          {!ownerAddress && (
            <Link to="/app/upload" className="btn-primary mt-5 inline-flex px-5 py-3">
              {t("records.uploadFirst")}
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map((r) => {
            const shared = Math.max(0, (r.sharedWith?.length || 1) - 1);
            return (
              <li key={r.recordId} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl">
                    📄
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{r.fileName}</p>
                    <p className="text-sm text-slate-500">
                      {t(`recordTypes.${r.recordType}`)} · {formatBytes(r.fileSize)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t("records.uploadedOn")} {formatDate(r.createdAt)}
                    </p>
                    {!ownerAddress && (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {shared === 0
                          ? t("records.sharedWithNone")
                          : t(shared === 1 ? "records.sharedWith" : "records.sharedWithPlural", { n: shared })}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => open(r)}
                  disabled={busyId === r.recordId}
                  className="btn-primary mt-3 w-full py-3"
                >
                  {busyId === r.recordId ? <Spinner className="h-4 w-4" /> : null}
                  {busyId === r.recordId ? t("records.opening") : t("records.open")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => {
          setActive(null);
          setOpened(null);
        }}
        title={active?.fileName || ""}
        wide
        footer={
          <>
            {opened && (
              <button
                onClick={() => downloadBlob(opened.blob, opened.meta.name || active.fileName)}
                className="btn-ghost"
              >
                {t("records.download")}
              </button>
            )}
            <button onClick={() => { setActive(null); setOpened(null); }} className="btn-primary">
              {t("common.close")}
            </button>
          </>
        }
      >
        {!opened ? (
          <div className="flex flex-col items-center py-10">
            <Spinner className="h-7 w-7 text-brand-600" />
            <p className="mt-3 text-sm text-slate-500">{t("records.opening")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <span className="text-xl">🛡️</span>
              <div>
                <p className="font-semibold text-emerald-900">{t("records.verified")}</p>
                <p className="text-sm text-emerald-800">{t("records.verifiedHint")}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              {isPreviewable(opened.meta.type) ? (
                opened.meta.type.startsWith("image/") ? (
                  <ZoomFrame>
                    <img src={opened.url} alt="" className="mx-auto block w-full" />
                  </ZoomFrame>
                ) : opened.meta.type === "application/pdf" ? (
                  <PdfPreview blob={opened.blob} />
                ) : (
                  <TextPreview blob={opened.blob} />
                )
              ) : (
                <p className="p-8 text-center text-sm text-slate-500">{t("records.cannotPreview")}</p>
              )}
            </div>

            {/* Technical detail is opt-in, never in the patient's way. */}
            <div className="rounded-xl border border-slate-200">
              <button
                onClick={() => setShowTech((s) => !s)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600"
              >
                {t("tech.title")}
                <span>{showTech ? "▲" : "▼"}</span>
              </button>
              {showTech && (
                <dl className="space-y-2 border-t border-slate-100 px-4 py-3 text-xs">
                  <Row k={t("tech.recordId")} v={`#${active.recordId}`} />
                  <Row k={t("tech.encryption")} v={t("tech.encryptionValue")} />
                  <Row k={t("tech.storage")} v={t("tech.storageValue")} />
                  <Row k={t("tech.cid")} v={active.cid} mono />
                  <Row k={t("tech.hash")} v={active.dataHash} mono />
                  {active.txHash && (
                    <div className="pt-1">
                      <a
                        href={`${EXPLORER}/tx/${active.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brand-600"
                      >
                        {t("tech.viewOnExplorer")} ↗
                      </a>
                    </div>
                  )}
                  <p className="pt-1 text-slate-500">{t("tech.neverOnChain")}</p>
                </dl>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{k}</dt>
      <dd className={`break-all text-slate-700 ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  );
}

/**
 * Pinch-and-button zoom for anything shown in the viewer.
 *
 * A doctor reading a scan or a lab report needs to enlarge it; before this the
 * preview was fixed at fit-to-width with no way in. Uses the CSS `zoom`
 * property rather than `transform: scale()` because `zoom` affects layout, so
 * the scroll area grows with the content and the whole page stays reachable.
 */
function ZoomFrame({ children }) {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const pinch = useRef(null);

  const clamp = (z) => Math.min(5, Math.max(1, Number(z.toFixed(2))));
  const spread = (touches) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

  const onTouchStart = (e) => {
    if (e.touches.length === 2) pinch.current = { from: spread(e.touches), at: zoom };
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      setZoom(clamp((pinch.current.at * spread(e.touches)) / pinch.current.from));
    }
  };
  const endPinch = () => { pinch.current = null; };

  return (
    <div className="relative">
      <div
        className="max-h-[55vh] touch-pan-x touch-pan-y overflow-auto bg-slate-100"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endPinch}
        onTouchCancel={endPinch}
        onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
      >
        <div style={{ zoom }}>{children}</div>
      </div>

      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-slate-900/80 px-1 py-1 text-white shadow-lg">
        <button
          type="button"
          aria-label={t("records.zoomOut")}
          onClick={() => setZoom((z) => clamp(z - 0.5))}
          disabled={zoom <= 1}
          className="h-8 w-8 rounded-full text-lg leading-none disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="min-w-[3rem] px-1 text-xs font-semibold tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label={t("records.zoomIn")}
          onClick={() => setZoom((z) => clamp(z + 0.5))}
          disabled={zoom >= 5}
          className="h-8 w-8 rounded-full text-lg leading-none disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * PDF preview.
 *
 * Android's WebView has no built-in PDF viewer, so an <iframe> pointed at a
 * PDF renders an empty box there while working fine in a desktop browser.
 * pdf.js draws each page onto a canvas instead, so the app and the website
 * show the record identically.
 *
 * The library is imported dynamically: it is large, and only a patient who
 * actually opens a PDF should pay for it. Nothing here touches decryption -
 * the blob handed in has already been fetched, verified and decrypted.
 */
function PdfPreview({ blob }) {
  const t = useT();
  const hostRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | failed

  useEffect(() => {
    let cancelled = false;
    let worker = null;
    let task = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
        const PdfWorker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker")).default;
        worker = new PdfWorker();
        pdfjs.GlobalWorkerOptions.workerPort = worker;

        const data = new Uint8Array(await blob.arrayBuffer());
        task = pdfjs.getDocument({
          data,
          // Lab reports habitually use the base-14 fonts without embedding
          // them; without this the text renders blank.
          standardFontDataUrl: "/pdf-fonts/",
        });
        const doc = await task.promise;
        if (cancelled) return;

        const host = hostRef.current;
        if (!host) return;
        host.replaceChildren();

        const width = host.clientWidth || 320;
        const pageCount = Math.min(doc.numPages, 25);

        for (let n = 1; n <= pageCount; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;

          const base = page.getViewport({ scale: 1 });
          // Cap the raster so a long report cannot exhaust memory on a phone.
          const scale = Math.min((width / base.width) * (window.devicePixelRatio || 1), 3);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "mx-auto block w-full";
          host.appendChild(canvas);

          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
        }

        setState("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("[pdf] preview failed:", err);
          setState("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      // destroy() belongs to the loading task, not the document proxy.
      task?.destroy?.();
      worker?.terminate?.();
    };
  }, [blob]);

  if (state === "failed") {
    return <p className="p-8 text-center text-sm text-slate-500">{t("records.cannotPreview")}</p>;
  }

  // The host stays laid out even while loading: its measured width decides the
  // raster scale, and a hidden element measures zero, which would render every
  // page at the fallback width and look blurry on a wide screen.
  return (
    <div className="relative">
      {state === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      )}
      <ZoomFrame>
        <div ref={hostRef} className="min-h-[220px] space-y-2 p-2" />
      </ZoomFrame>
    </div>
  );
}

function TextPreview({ blob }) {
  const [text, setText] = useState("...");
  useEffect(() => {
    blob.text().then((x) => setText(x.slice(0, 20000)));
  }, [blob]);
  return <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap p-4 text-xs">{text}</pre>;
}
