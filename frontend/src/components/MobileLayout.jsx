/**
 * Mobile-first application shell.
 *
 * A compact top bar, the routed screen, and a thumb-reachable bottom tab bar.
 * On wide screens the same tabs move to a left rail so the app is usable on a
 * laptop without a second layout.
 */
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { Toast } from "./ui";
import Avatar from "./Avatar";

function IconHome(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRecords(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  );
}
function IconRequests(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M18 8A6 6 0 1 0 6 8c0 7-3 8-3 8h18s-3-1-3-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  );
}
function IconProfile(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" strokeLinecap="round" />
    </svg>
  );
}
function IconSearch(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

const PATIENT_TABS = [
  { to: "/app", key: "nav.home", Icon: IconHome, end: true },
  { to: "/app/records", key: "nav.records", Icon: IconRecords },
  { to: "/app/requests", key: "nav.requests", Icon: IconRequests, badge: true },
  { to: "/app/profile", key: "nav.profile", Icon: IconProfile },
];

const DOCTOR_TABS = [
  { to: "/app", key: "nav.home", Icon: IconHome, end: true },
  { to: "/app/find", key: "nav.patients", Icon: IconSearch },
  { to: "/app/records", key: "nav.records", Icon: IconRecords },
  { to: "/app/profile", key: "nav.profile", Icon: IconProfile },
];

export default function MobileLayout({ pendingCount = 0 }) {
  const { user, unlocked } = useApp();
  const t = useT();
  const navigate = useNavigate();
  const tabs = user?.role === "doctor" ? DOCTOR_TABS : PATIENT_TABS;

  return (
    <div className="app-aurora flex min-h-[100dvh] flex-col sm:flex-row">
      {/* Wide-screen rail */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white sm:flex sm:flex-col">
        <button
          onClick={() => navigate("/app")}
          className="flex items-center gap-2.5 px-5 py-5 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white">
            &#129658;
          </span>
          <span className="text-base font-bold text-slate-900">{t("app.name")}</span>
        </button>
        <nav className="flex-1 space-y-1 px-3">
          {tabs.map(({ to, key, Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${
                  isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1">{t(key)}</span>
              {badge && pendingCount > 0 && (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-base text-white">
              &#129658;
            </span>
            <span className="text-sm font-bold text-slate-900">{t("app.name")}</span>
          </div>
          <div className="flex items-center gap-2">
            {!unlocked && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                &#128274;
              </span>
            )}
            <NavLink to="/app/profile" aria-label={t("nav.profile")}>
              <Avatar wallet={user?.walletAddress} name={user?.name} size="sm" />
            </NavLink>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
          <div className="mx-auto w-full max-w-3xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Thumb-reachable bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {tabs.map(({ to, key, Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                isActive ? "text-brand-600" : "text-slate-400"
              }`
            }
          >
            <Icon className="h-6 w-6" />
            {t(key)}
            {badge && pendingCount > 0 && (
              <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Toast toast={useApp().toast} />
    </div>
  );
}
