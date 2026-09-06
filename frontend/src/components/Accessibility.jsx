/**
 * Accessibility: app-wide text zoom.
 *
 * Older patients are a real user group for this application, and the default
 * type is small on a phone. This scales the whole interface by changing the
 * root font size, so every `rem`-based size grows together and the responsive
 * layout keeps working - unlike a CSS transform, which would scale the page
 * out of the viewport and produce horizontal scrolling.
 *
 * The choice is per-device and remembered, so a user sets it once.
 */
import { useCallback, useEffect, useState } from "react";

import { useT } from "../i18n";

const KEY = "medchain.zoom";
const MIN = 100;
const MAX = 160;
const STEP = 10;

/** Read the saved level. Storage can throw in a private window, so guard it. */
function readSaved() {
  try {
    const raw = Number(localStorage.getItem(KEY));
    if (Number.isFinite(raw) && raw >= MIN && raw <= MAX) return raw;
  } catch {
    /* no stored preference available */
  }
  return MIN;
}

/** Apply a level to the document. Exported so main.jsx can apply it on boot. */
export function applyZoom(percent) {
  const clamped = Math.min(MAX, Math.max(MIN, percent));
  // 16px is the browser default; everything in the app is sized in rem.
  document.documentElement.style.fontSize = `${(16 * clamped) / 100}px`;
  return clamped;
}

/** Restore the saved level. Call once at start-up. */
export function restoreZoom() {
  applyZoom(readSaved());
}

export default function Accessibility() {
  const t = useT();
  const [zoom, setZoom] = useState(readSaved);

  useEffect(() => {
    applyZoom(zoom);
    try {
      localStorage.setItem(KEY, String(zoom));
    } catch {
      /* preference simply will not persist */
    }
  }, [zoom]);

  const nudge = useCallback((delta) => {
    setZoom((z) => Math.min(MAX, Math.max(MIN, z + delta)));
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">🔍 {t("access.title")}</h2>
      <p className="mt-1 text-xs text-slate-500">{t("access.hint")}</p>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => nudge(-STEP)}
          disabled={zoom <= MIN}
          aria-label={t("access.zoomOut")}
          className="btn-ghost h-12 w-12 shrink-0 rounded-xl border border-slate-200 text-xl disabled:opacity-40"
        >
          🔎
        </button>

        <div className="flex-1 text-center">
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">{zoom}%</p>
          <p className="text-xs text-slate-500">{t("access.textSize")}</p>
        </div>

        <button
          onClick={() => nudge(STEP)}
          disabled={zoom >= MAX}
          aria-label={t("access.zoomIn")}
          className="btn-ghost h-12 w-12 shrink-0 rounded-xl border border-slate-200 text-xl disabled:opacity-40"
        >
          🔍
        </button>
      </div>

      <button
        onClick={() => setZoom(MIN)}
        disabled={zoom === MIN}
        className="btn-ghost mt-3 w-full border border-slate-200 disabled:opacity-40"
      >
        ↺ {t("access.reset")}
      </button>
    </section>
  );
}
