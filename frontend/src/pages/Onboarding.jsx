/**
 * First screen: choose a language.
 *
 * Deliberately the very first thing a user sees, before any English text can
 * confuse them. The choice is remembered, so this appears once.
 */
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";

export default function Onboarding() {
  const { lang, setLang, t, languages } = useI18n();
  const navigate = useNavigate();

  const pick = (code) => {
    setLang(code);
    // Give the UI a beat to re-render in the chosen language before moving on.
    setTimeout(() => navigate("/login"), 180);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-50 to-white px-6 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-600 text-4xl text-white shadow-lg">
            &#129658;
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">
            {t("app.name")}
          </h1>
          <p className="mt-2 text-slate-600">{t("app.tagline")}</p>
        </div>

        <h2 className="mb-1 text-center text-lg font-bold text-slate-900">
          {t("language.choose")}
        </h2>
        <p className="mb-6 text-center text-sm text-slate-500">{t("language.subtitle")}</p>

        <div className="space-y-3">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              className={`flex w-full items-center justify-between rounded-2xl border-2 px-5 py-5 text-left transition active:scale-[0.99] ${
                lang === l.code
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span>
                <span className="block text-xl font-bold text-slate-900">{l.native}</span>
                <span className="block text-sm text-slate-500">{l.label}</span>
              </span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  lang === l.code ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                }`}
              >
                {lang === l.code && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="mx-auto max-w-md text-center text-xs text-slate-400">
        S. G. Balekundri Institute of Technology, Belagavi
      </p>
    </div>
  );
}
