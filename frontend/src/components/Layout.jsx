import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { shortAddress, NETWORK_NAME, CONTRACT_ADDRESS, addressUrl } from "../lib/web3";
import { Spinner, Toast } from "./ui";

const NAV = {
  patient: [
    { to: "/patient", label: "Dashboard", end: true },
    { to: "/patient/upload", label: "Upload Record" },
    { to: "/patient/records", label: "My Records" },
    { to: "/patient/requests", label: "Access Requests" },
    { to: "/patient/permissions", label: "Permissions" },
    { to: "/patient/activity", label: "Activity" },
  ],
  doctor: [
    { to: "/doctor", label: "Dashboard", end: true },
    { to: "/doctor/patients", label: "Find Patient" },
    { to: "/doctor/requests", label: "My Requests" },
    { to: "/doctor/records", label: "Authorized Records" },
    { to: "/doctor/activity", label: "Activity" },
  ],
  admin: [
    { to: "/admin", label: "Dashboard", end: true },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/records", label: "Records" },
    { to: "/admin/activity", label: "Blockchain Activity" },
    { to: "/admin/audit", label: "Audit Logs" },
  ],
};

export default function Layout() {
  const { user, wallet, keyPair, connect, walletBusy, logout, toast, walletMatchesAccount } = useApp();
  const navigate = useNavigate();
  const links = NAV[user?.role] || [];

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={`/${user?.role || ""}`} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white shadow-sm">
              &#129658;
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-slate-900">MedChain</span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Secure Medical Records
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {NETWORK_NAME}
            </span>

            {wallet ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  keyPair
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                }`}
                title={keyPair ? "Wallet connected, encryption key unlocked" : "Encryption key locked"}
              >
                {keyPair ? "\u{1F513}" : "\u{1F512}"} {shortAddress(wallet.address)}
              </span>
            ) : (
              <button onClick={connect} disabled={walletBusy} className="btn-primary btn-sm">
                {walletBusy ? <Spinner className="h-3.5 w-3.5" /> : "\u{1F98A}"} Connect MetaMask
              </button>
            )}

            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-800">{user?.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{user?.role}</p>
            </div>
            <button onClick={onLogout} className="btn-ghost btn-sm">
              Sign out
            </button>
          </div>
        </div>

        {!walletMatchesAccount && (
          <div className="bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white">
            MetaMask is on {shortAddress(wallet?.address)} but this account is linked to{" "}
            {shortAddress(user?.walletAddress)}. Switch accounts in MetaMask to continue.
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `block rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}

            {CONTRACT_ADDRESS && (
              <a
                href={addressUrl(CONTRACT_ADDRESS)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 hover:border-brand-300"
              >
                <span className="font-semibold text-slate-700">Smart contract</span>
                <span className="mono mt-1 block break-all text-[10px] text-slate-400">
                  {CONTRACT_ADDRESS}
                </span>
              </a>
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-16">
          {/* Mobile nav */}
          <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                    isActive ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>

          <Outlet />
        </main>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
