/**
 * Activity: a plain-language history of everything that touched the user's
 * records. The underlying entries are the same audit log the desktop console
 * shows; only the wording changes.
 */
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui";
import { describe, visibleLogs, since } from "./PatientHome";

export default function Activity() {
  const t = useT();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .myAudit(100)
      .then(({ logs }) => setLogs(visibleLogs(logs)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("activity.title")}</h1>
        <p className="text-slate-500">{t("activity.subtitle")}</p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">📋</div>
          <p className="mt-3 font-semibold text-slate-800">{t("activity.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="font-medium text-slate-800">{describe(l, t)}</p>
              <p className="mt-0.5 text-xs text-slate-400">{since(l.at, t)}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-slate-400">🔗 {t("activity.permanent")}</p>
    </div>
  );
}
