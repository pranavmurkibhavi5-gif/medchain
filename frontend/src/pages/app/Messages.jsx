/**
 * Conversations list.
 *
 * A patient can start a conversation from any doctor's profile; a doctor sees
 * whoever has written to them. Nothing is shown here but names, times and
 * unread counts - message content is never fetched for this screen.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useT } from "../../i18n";
import { useApp } from "../../context/AppContext";
import { listThreads } from "../../lib/messages-store";
import { Spinner, timeAgo } from "../../components/ui";
import Avatar from "../../components/Avatar";

export default function Messages() {
  const { user, notify } = useApp();
  const t = useT();

  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { threads } = await listThreads();
      setThreads(threads || []);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
    // Cheap enough to poll: this endpoint returns counts, not content.
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("chat.title")}</h1>
        <p className="text-slate-500">{t("chat.listHint")}</p>
      </div>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        ⏳ {t("chat.expiryNotice")}
      </p>

      {threads.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">💬</div>
          <p className="mt-3 font-semibold text-slate-800">{t("chat.empty")}</p>
          {user?.role === "patient" && (
            <Link to="/app/find-doctors" className="btn-primary mt-5 inline-flex px-5 py-3">
              {t("doctor.findTitle")}
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {threads.map((th) => (
            <li key={th.address}>
              <Link
                to={`/app/messages/${th.address}`}
                className="glass flex items-center gap-3 border p-4"
              >
                <Avatar wallet={th.address} name={th.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{th.name}</p>
                  <p className="truncate text-sm text-slate-500">
                    {th.specialization || (th.role === "doctor" ? t("auth.doctor") : t("auth.patient"))}
                  </p>
                  {th.lastAt && (
                    <p className="text-xs text-slate-400">{timeAgo(th.lastAt)}</p>
                  )}
                </div>
                {th.unread > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                    {th.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
