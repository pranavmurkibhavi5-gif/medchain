/**
 * Sign in.
 *
 * Email and password only. The password also unlocks the user's blockchain
 * identity, but the screen never says so - that is infrastructure, not
 * something a patient needs to reason about.
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import { Spinner } from "../components/ui";

export default function Login() {
  const { user, login, loadingUser, busy } = useApp();
  const { t, lang, setLang, languages } = useI18n();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  if (!loadingUser && user) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(form.email.trim(), form.password);
      navigate("/app", { replace: true });
    } catch (err) {
      const m = String(err.message || "");
      if (m.includes("Invalid email or password")) setError(t("errors.invalidLogin"));
      else if (m.includes("WRONG_PASSWORD")) setError(t("errors.wrongPassword"));
      else if (m.includes("Cannot reach")) setError(t("errors.network"));
      else setError(m || t("errors.generic"));
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white px-6 py-8">
      {/* Language switch stays reachable on every auth screen */}
      <div className="flex justify-end">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600"
          aria-label={t("language.current")}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
            </option>
          ))}
        </select>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">
            &#129658;
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">{t("auth.welcomeBack")}</h1>
          <p className="mt-1 text-slate-500">{t("app.tagline")}</p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t("auth.email")}</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="input-lg"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">{t("auth.password")}</label>
            <div className="relative">
              <input
                id="password"
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                className="input-lg pr-16"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-brand-600"
              >
                {show ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full py-4 text-base">
            {busy ? <Spinner /> : null}
            {busy ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>

        <p className="mt-8 text-center text-slate-500">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-bold text-brand-600">
            {t("auth.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
