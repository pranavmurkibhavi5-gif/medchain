/**
 * Unlock screen.
 *
 * The password is never persisted, so after a page refresh the session is
 * valid but the vault is closed. Rather than silently failing on the first
 * action, the app asks for the password once and reopens the vault.
 */
import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { Spinner } from "../../components/ui";

export default function Unlock() {
  const { user, unlockWith, logout } = useApp();
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlockWith(password);
    } catch (err) {
      setError(err.code === "WRONG_PASSWORD" ? t("errors.wrongPassword") : t("errors.unlockFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-2">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl">
          🔒
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900">
          {t("auth.welcomeBack")}, {(user?.name || "").split(" ")[0]}
        </h1>
        <p className="mt-1 text-slate-500">{t("auth.password")}</p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="input-lg text-center"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy} className="btn-primary w-full py-4 text-base">
            {busy ? <Spinner /> : null}
            {busy ? t("common.loading") : t("common.continue")}
          </button>
        </form>

        <button onClick={logout} className="mt-6 text-sm font-semibold text-slate-500">
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}
