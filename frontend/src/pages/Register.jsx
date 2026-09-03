/**
 * Create an account.
 *
 * Two steps so a phone screen is never crowded: who you are, then your
 * details. Creating the account also creates the user's blockchain identity
 * and seals it under this password - the screen says only that the password
 * protects their records, which is the part that matters to them.
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useI18n } from "../i18n";
import { Spinner } from "../components/ui";

export default function Register() {
  const { user, register, loadingUser, busy } = useApp();
  const { t, lang, setLang, languages } = useI18n();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [role, setRole] = useState("patient");
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirm: "",
    dateOfBirth: "", bloodGroup: "", phone: "",
    specialization: "", licenseId: "", hospital: "",
  });
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  if (!loadingUser && user) return <Navigate to="/app" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.name.trim().length < 2) return setError(t("errors.nameRequired"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError(t("errors.emailInvalid"));
    if (form.password.length < 8) return setError(t("errors.passwordShort"));
    if (form.password !== form.confirm) return setError(t("errors.passwordMismatch"));
    if (role === "doctor" && !form.licenseId.trim()) return setError(t("errors.licenseRequired"));

    try {
      const { confirm, ...payload } = form;
      await register({ ...payload, role, email: form.email.trim() });
      navigate("/app", { replace: true });
    } catch (err) {
      const m = String(err.message || "");
      if (m.includes("already exists")) setError(t("errors.emailTaken"));
      else if (m.includes("Cannot reach")) setError(t("errors.network"));
      else setError(m || t("errors.setupFailed"));
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white px-6 py-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => (step === 1 ? navigate("/login") : setStep(1))}
          className="text-sm font-semibold text-slate-500"
        >
          ← {t("common.back")}
        </button>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600"
          aria-label={t("language.current")}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.native}</option>
          ))}
        </select>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 pt-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("auth.createAccount")}</h1>
        <div className="mt-4 flex gap-2">
          {[1, 2].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-brand-600" : "bg-slate-200"}`}
            />
          ))}
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {step === 1 ? (
          <div className="mt-6">
            <p className="mb-3 font-semibold text-slate-800">{t("auth.iAmA")}</p>
            <div className="space-y-3">
              {[
                { key: "patient", icon: "🧑", label: t("auth.patient"), hint: t("auth.patientHint") },
                { key: "doctor", icon: "👩‍⚕️", label: t("auth.doctor"), hint: t("auth.doctorHint") },
              ].map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRole(r.key)}
                  className={`flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition ${
                    role === r.key ? "border-brand-500 bg-brand-50" : "border-slate-200"
                  }`}
                >
                  <span className="text-3xl">{r.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-lg font-bold text-slate-900">{r.label}</span>
                    <span className="block text-sm text-slate-500">{r.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} className="btn-primary mt-6 w-full py-4 text-base">
              {t("common.continue")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">{t("auth.fullName")}</label>
              <input required className="input-lg" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label">{t("auth.email")}</label>
              <input required type="email" inputMode="email" className="input-lg"
                     value={form.email} onChange={set("email")} />
            </div>

            {role === "doctor" && (
              <>
                <div>
                  <label className="label">
                    {t("auth.licenseId")} <span className="text-rose-500">*</span>
                  </label>
                  <input required className="input-lg" value={form.licenseId} onChange={set("licenseId")} />
                </div>
                <div>
                  <label className="label">
                    {t("auth.specialization")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </label>
                  <input className="input-lg" value={form.specialization} onChange={set("specialization")} />
                </div>
                <div>
                  <label className="label">
                    {t("auth.hospital")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </label>
                  <input className="input-lg" value={form.hospital} onChange={set("hospital")} />
                </div>
              </>
            )}

            {role === "patient" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    {t("auth.dateOfBirth")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </label>
                  <input type="date" className="input-lg" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
                </div>
                <div>
                  <label className="label">
                    {t("auth.bloodGroup")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </label>
                  <select className="input-lg" value={form.bloodGroup} onChange={set("bloodGroup")}>
                    <option value="">—</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="label">{t("auth.password")}</label>
              <div className="relative">
                <input
                  required
                  type={show ? "text" : "password"}
                  className="input-lg pr-16"
                  placeholder={t("auth.passwordHint")}
                  value={form.password}
                  onChange={set("password")}
                />
                <button type="button" onClick={() => setShow((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-brand-600">
                  {show ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div>
              <label className="label">{t("auth.confirmPassword")}</label>
              <input required type={show ? "text" : "password"} className="input-lg"
                     value={form.confirm} onChange={set("confirm")} />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("auth.passwordImportant")}
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full py-4 text-base">
              {busy ? <Spinner /> : null}
              {busy ? t("auth.settingUp") : t("auth.register")}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-slate-500">
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-bold text-brand-600">{t("auth.signIn")}</Link>
        </p>
      </div>
    </div>
  );
}
