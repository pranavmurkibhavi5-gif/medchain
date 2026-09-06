/**
 * Patient home.
 *
 * Four cards answering the only questions a patient actually has: how many
 * records do I have, is anyone waiting on me, who can see my records, and what
 * happened recently.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { Spinner } from "../../components/ui";
import DashboardHero from "../../components/DashboardHero";

function Card({ to, icon, tone, label, sub, value, urgent }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Link
      to={to}
      className={`glass flex items-center gap-4 border p-4 transition active:scale-[0.99] ${
        urgent ? "border-amber-300 shadow-sm" : "border-slate-200"
      }`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${tones[tone]}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-slate-900">{label}</span>
        <span className="block truncate text-sm text-slate-500">{sub}</span>
      </span>
      <span className="text-2xl font-extrabold text-slate-900">{value}</span>
    </Link>
  );
}

export default function PatientHome({ onCounts }) {
  const { user, unlocked, contract, address } = useApp();
  const t = useT();

  const [records, setRecords] = useState([]);
  const [pending, setPending] = useState(0);
  const [doctors, setDoctors] = useState(0);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [{ records }, { logs }] = await Promise.all([
        api.myRecords().catch(() => ({ records: [] })),
        api.myAudit(12).catch(() => ({ logs: [] })),
      ]);
      setRecords(records);
      setActivity(visibleLogs(logs).slice(0, 5));

      if (unlocked) {
        try {
          const c = await contract();
          const [reqs, [, active]] = await Promise.all([
            c.getPatientRequests(address),
            c.getGrantedDoctors(address),
          ]);
          const p = reqs.filter((r) => Number(r.status) === 1).length;
          setPending(p);
          setDoctors(active.filter(Boolean).length);
          onCounts?.({ pending: p });
        } catch {
          /* chain unreachable - cards still render with what we have */
        }
      }
    } finally {
      setLoading(false);
    }
  }, [unlocked, contract, address, onCounts]);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = (user?.name || "").split(" ")[0];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DashboardHero
        name={t("dashboard.greeting", { name: firstName })}
        wallet={address}
        subtitle={t("app.tagline")}
        stats={[
          { label: t("dashboard.myRecords"), value: records.length },
          { label: t("dashboard.pendingRequests"), value: pending },
          { label: t("dashboard.doctorsWithAccess"), value: doctors },
        ]}
      />

      {pending > 0 && (
        <Link
          to="/app/requests"
          className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
        >
          <span className="text-2xl">🔔</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-amber-900">
              {t(pending === 1 ? "dashboard.actionNeeded" : "dashboard.actionNeededPlural", { n: pending })}
            </span>
            <span className="block text-sm text-amber-700">{t("dashboard.reviewNow")} →</span>
          </span>
        </Link>
      )}

      <div className="space-y-3">
        <Card to="/app/records" icon="📁" tone="brand" value={records.length}
              label={t("dashboard.myRecords")} sub={t("dashboard.myRecordsSub")} />
        <Card to="/app/requests" icon="🔔" tone="amber" value={pending} urgent={pending > 0}
              label={t("dashboard.pendingRequests")} sub={t("dashboard.pendingRequestsSub")} />
        <Card to="/app/messages" icon="💬" tone="violet" value=""
              label={t("chat.title")} sub={t("dashboard.messagesSub")} />
        <Card to="/app/find-doctors" icon="🔍" tone="brand" value=""
              label={t("doctor.findTitle")} sub={t("dashboard.findDoctorsSub")} />
        <Card to="/app/appointments" icon="📅" tone="emerald" value=""
              label={t("nav.appointments")} sub={t("dashboard.appointmentsSub")} />
        <Card to="/app/doctors" icon="👨‍⚕️" tone="violet" value={doctors}
              label={t("dashboard.doctorsWithAccess")} sub={t("dashboard.doctorsWithAccessSub")} />
      </div>

      <Link to="/app/upload" className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-base">
        <span className="text-xl">＋</span> {t("dashboard.quickUpload")}
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{t("dashboard.recentActivity")}</h2>
          <Link to="/app/activity" className="text-sm font-semibold text-brand-600">
            {t("dashboard.viewAll")}
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">{t("dashboard.noActivity")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((l) => (
              <li key={l.id} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-800">{describe(l, t)}</p>
                <p className="text-xs text-slate-400">{since(l.at, t)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Events that are pure infrastructure. A patient has no use for "wallet
 * linked" or "gas sponsored", and the wording leaks exactly the vocabulary the
 * app is meant to hide, so they are hidden from the patient-facing feed. They
 * remain in the audit log and in the admin console.
 */
export const INFRA_ACTIONS = new Set([
  "WALLET_LINKED",
  "GAS_SPONSORED",
  "IPFS_UPLOAD",
  "USER_LOGIN",
  "CHAIN_REGISTERED",
]);

export const visibleLogs = (logs) => (logs || []).filter((l) => !INFRA_ACTIONS.has(l.action));

/** Localised relative time. */
export function since(value, t) {
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return t("activity.justNow");
  if (s < 3600) return t("activity.minutesAgo", { n: Math.floor(s / 60) });
  if (s < 86400) return t("activity.hoursAgo", { n: Math.floor(s / 3600) });
  if (s < 604800) return t("activity.daysAgo", { n: Math.floor(s / 86400) });
  return d.toLocaleDateString();
}

/** Turn a raw audit action into something a patient can read. */
export function describe(log, t) {
  const map = {
    USER_REGISTERED: "activity.accountCreated",
    RECORD_UPLOADED: "activity.uploaded",
    CHAIN_REGISTERED: "activity.uploaded",
    ACCESS_GRANTED: "activity.granted",
    KEY_SHARED: "activity.granted",
    ACCESS_REJECTED: "activity.rejected",
    ACCESS_REVOKED: "activity.revokedAccess",
    RECORD_ACCESSED: "activity.doctorViewed",
    RECORD_VIEWED: "activity.doctorViewed",
    ACCESS_REQUESTED: "activity.doctorRequested",
    ACCESS_DENIED: "activity.accessDenied",
  };
  const key = map[log.action];
  return key ? t(key) : log.action.replace(/_/g, " ").toLowerCase();
}
