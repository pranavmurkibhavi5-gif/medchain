/**
 * Create or replace the account recovery key.
 *
 * This is the answer to the one flaw the design otherwise has: the password
 * derives the key to the records, so forgetting it destroyed them. A recovery
 * key seals a second copy of the same wallet key under a code only the user
 * holds - the server gains nothing it can open.
 *
 * The code is shown exactly once. It is generated here, sealed here, and never
 * sent anywhere; only the sealed blob is uploaded. Replacing it invalidates
 * the previous one, because the new blob overwrites the old.
 */
import { useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { createRecovery, recoverySheet } from "../lib/recovery";
import { downloadBlob } from "../lib/records";

export default function RecoveryKey() {
  const { user, secret, unlocked, notify, refreshUser } = useApp();
  const t = useT();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const { code, vault, salt } = await createRecovery(secret.privateKey);
      await api.putRecovery({ vault, salt });
      setCode(code);
      setSaved(false);
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const sheet = recoverySheet(code, user?.email || "");
    downloadBlob(new Blob([sheet], { type: "text/plain" }), "medchain-recovery-key.txt");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify(t("recovery.copied"), "success");
    } catch {
      // Clipboard is unavailable in some WebViews; the code is on screen.
      setError(t("recovery.copyFailed"));
    }
  };

  return (
    <section className="glass border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-left">
          <span className="block font-semibold text-slate-900">🗝️ {t("recovery.title")}</span>
          <span className="block text-xs text-slate-500">
            {user?.hasRecovery ? t("recovery.isSet") : t("recovery.notSet")}
          </span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {!unlocked ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t("recovery.needUnlock")}
            </p>
          ) : code ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">{t("recovery.writeItDown")}</p>

              <p className="select-all break-all rounded-xl border-2 border-brand-300 bg-brand-50 p-4 text-center font-mono text-lg font-bold tracking-wider text-brand-900">
                {code}
              </p>

              <div className="flex flex-wrap gap-2">
                <button onClick={download} className="btn-ghost btn-sm">
                  ⬇ {t("recovery.download")}
                </button>
                <button onClick={copy} className="btn-ghost btn-sm">
                  ⧉ {t("recovery.copy")}
                </button>
              </div>

              <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                ⚠️ {t("recovery.shownOnce")}
              </p>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                {t("recovery.confirmSaved")}
              </label>

              <button
                onClick={() => setCode("")}
                disabled={!saved}
                className="btn-primary w-full disabled:opacity-50"
              >
                {t("common.done")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{t("recovery.explain")}</p>

              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                {t("recovery.serverNote")}
              </p>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button onClick={make} disabled={busy} className="btn-primary w-full">
                {busy
                  ? t("recovery.creating")
                  : user?.hasRecovery
                    ? t("recovery.replace")
                    : t("recovery.create")}
              </button>

              {user?.hasRecovery && (
                <p className="text-xs text-slate-400">{t("recovery.replaceNote")}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
