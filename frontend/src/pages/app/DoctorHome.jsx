/**
 * Doctor home: who has approved me, and what am I still waiting on.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { Spinner, formatDate } from "../../components/ui";
import DashboardHero from "../../components/DashboardHero";
import SystemStatus from "../../components/SystemStatus";

export default function DoctorHome() {
  const { user, address, contract, unlocked } = useApp();
  const t = useT();

  const [approved, setApproved] = useState([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!unlocked) return setLoading(false);
    try {
      const c = await contract();
      const [raw, { patients }] = await Promise.all([
        c.getDoctorRequests(address),
        api.patients("").catch(() => ({ patients: [] })),
      ]);
      setPending(raw.filter((r) => Number(r.status) === 1).length);

      const ok = [];
      await Promise.all(
        patients.map(async (p) => {
          try {
            if (await c.hasAccess(p.walletAddress, address, 0n)) ok.push(p);
          } catch {
            /* skip */
          }
        })
      );
      setApproved(ok);
    } catch {
      /* chain unreachable */
    } finally {
      setLoading(false);
    }
  }, [unlocked, contract, address]);

  useEffect(() => {
    load();
  }, [load]);

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
        name={t("dashboard.greeting", { name: (user?.name || "").split(" ")[0] })}
        wallet={address}
        subtitle={`${user?.specialization || t("doctor.dashboard")}${
          user?.hospital ? ` · ${user.hospital}` : ""
        }`}
        stats={[
          { label: t("doctor.patientsWithAccess"), value: approved.length },
          { label: t("doctor.waitingApproval"), value: pending },
        ]}
      />

      <Link to="/app/find" className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-base">
        🔍 {t("doctor.findPatient")}
      </Link>

      <SystemStatus />

      <Link
        to="/app/messages"
        className="glass-card flex items-center gap-4 border p-4"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-2xl">
          💬
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{t("chat.title")}</span>
          <span className="block truncate text-sm text-slate-500">{t("chat.listHint")}</span>
        </span>
        <span className="text-slate-400">›</span>
      </Link>

      <Link
        to="/app/appointments"
        className="glass-card flex items-center gap-4 border p-4"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
          📅
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{t("nav.appointments")}</span>
          <span className="block truncate text-sm text-slate-500">
            {t("appointments.doctorHint")}
          </span>
        </span>
        <span className="text-slate-400">›</span>
      </Link>

      <section className="glass border">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{t("doctor.approvedRecords")}</h2>
        </div>
        {approved.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-4xl">🔒</div>
            <p className="mt-3 font-semibold text-slate-800">{t("doctor.noAccess")}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{t("doctor.noAccessHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {approved.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/app/patient/${p.walletAddress}`}
                  className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg">
                    🧑
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{p.name}</span>
                    <span className="block text-xs text-emerald-600">{t("doctor.accessGranted")}</span>
                  </span>
                  <span className="text-slate-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
