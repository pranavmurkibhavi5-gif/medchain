/**
 * Help, About and Privacy.
 *
 * One component serves all three because they are the same shape: a title, an
 * intro, and a list of expandable sections. The content lives in the locale
 * files, so these pages are translated like everything else rather than being
 * three pages of hard-coded English.
 *
 * The Privacy text is deliberately specific about what is stored where, and
 * deliberately avoids claiming the system is completely secure. It also states
 * the one real weakness of the design - that the password now protects the
 * records - because a privacy page that hides its own trade-off is worthless.
 */
import { useState } from "react";

import { useT } from "../../i18n";

/** Section keys per page. Each resolves to `<page>.<key>Q` and `<key>A`. */
const SECTIONS = {
  help: [
    "start", "upload", "view", "grant", "revoke", "download",
    "findDoctor", "appointments", "chat", "voice", "password", "privacy",
  ],
  about: [
    "what", "why", "blockchain", "ipfs", "protection", "control",
    "benefits", "tech", "project",
  ],
  privacy: [
    "collected", "records", "onChain", "onIpfs", "inDatabase", "whoCanAccess",
    "permissions", "revoking", "auth", "audit", "limits",
  ],
};

const ICONS = { help: "❓", about: "ℹ️", privacy: "🔐" };

export default function Info({ page }) {
  const t = useT();
  const [openKey, setOpenKey] = useState(null);
  const keys = SECTIONS[page] || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">
          {ICONS[page]} {t(`${page}.title`)}
        </h1>
        <p className="mt-1 text-slate-500">{t(`${page}.intro`)}</p>
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {keys.map((k) => {
          const isOpen = openKey === k;
          return (
            <div key={k}>
              <button
                onClick={() => setOpenKey(isOpen ? null : k)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="font-semibold text-slate-900">{t(`${page}.${k}Q`)}</span>
                <span className="shrink-0 text-slate-400">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <p className="whitespace-pre-line px-5 pb-4 text-sm leading-relaxed text-slate-600">
                  {t(`${page}.${k}A`)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {page === "privacy" && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t("privacy.noGuarantee")}
        </p>
      )}
    </div>
  );
}
