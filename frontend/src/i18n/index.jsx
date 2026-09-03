/**
 * Localization.
 *
 * Every user-facing string lives in a locale file under this folder, keyed by a
 * dotted path. Components call t("nav.home") and never contain literal English,
 * so adding a language means adding one file and one entry in LANGUAGES - no
 * component changes.
 *
 * Missing keys fall back to English, then to the key itself, so a partially
 * translated locale degrades gracefully instead of rendering blanks.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import en from "./locales/en";
import kn from "./locales/kn";
import hi from "./locales/hi";

export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

const BUNDLES = { en, kn, hi };
const STORAGE_KEY = "medchain.lang";

const I18nContext = createContext(null);

/** Resolve "a.b.c" against a nested object. */
function lookup(bundle, key) {
  return key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), bundle);
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && BUNDLES[saved]) return saved;
    } catch {
      /* private mode */
    }
    // Fall back to the device language when we support it.
    const nav = (navigator.language || "en").slice(0, 2);
    return BUNDLES[nav] ? nav : "en";
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  /**
   * t("records.count", { n: 5 }) -> "5 records"
   * Placeholders are {name} style.
   */
  const t = useCallback(
    (key, vars) => {
      let s = lookup(BUNDLES[lang], key);
      if (s === undefined) s = lookup(BUNDLES.en, key);
      if (s === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, languages: LANGUAGES }),
    [lang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience: const t = useT(); */
export function useT() {
  return useI18n().t;
}

/** True once the user has explicitly chosen a language (drives onboarding). */
export function hasChosenLanguage() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}
