import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, StatCard, Alert, Spinner, Address, TxLink, timeAgo } from "../../components/ui";
import { api } from "../../lib/api";
import { CONTRACT_ADDRESS, addressUrl, NETWORK_NAME } from "../../lib/web3";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [overview, activity, audit] = await Promise.all([
        api.adminOverview(),
        api.adminActivity(12).catch(() => ({ events: [] })),
        api.adminAudit(10).catch(() => ({ logs: [] })),
      ]);
      setData(overview);
      setEvents(activity.events || []);
      setLogs(audit.logs || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  const off = data?.offChain || {};
  const on = data?.onChain;
  const net = data?.network || {};

  return (
    <div>
      <PageHeader
        title="System overview"
        subtitle="Users, records and blockchain health across the platform."
      >
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      <div className="mb-4">
        <Alert kind="info" title="Administrators cannot read medical records">
          This console shows metadata, hashes and activity only. Decryption keys are sealed to
          patient and doctor wallets, so no amount of database access reveals a medical file.
        </Alert>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Patients" value={off.patients ?? 0} hint="Registered accounts" icon="&#129333;" />
        <StatCard label="Doctors" value={off.doctors ?? 0} hint="Registered accounts" icon="&#128104;&#8205;&#9877;&#65039;" tone="violet" />
        <StatCard label="Records" value={off.records ?? 0} hint="Encrypted and anchored" icon="&#128193;" tone="emerald" />
        <StatCard label="Audit entries" value={off.auditEntries ?? 0} hint="Application log" icon="&#128203;" tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* System health */}
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Infrastructure</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Row label="Network">
                <span className="badge-green">{NETWORK_NAME}</span>
              </Row>
              <Row label="RPC connection">
                {net.connected ? (
                  <span className="badge-green">Connected</span>
                ) : (
                  <span className="badge-red">Offline</span>
                )}
              </Row>
              <Row label="Latest block">
                <span className="mono">{net.blockNumber?.toLocaleString() ?? "-"}</span>
              </Row>
              <Row label="Database">{data?.storage?.database}</Row>
              <Row label="IPFS provider">{data?.storage?.ipfs}</Row>
              <Row label="Contract">
                {CONTRACT_ADDRESS ? (
                  <a href={addressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer" className="link mono break-all text-xs">
                    {CONTRACT_ADDRESS}
                  </a>
                ) : (
                  <span className="badge-amber">Not configured</span>
                )}
              </Row>
            </dl>
          </div>

          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">On-chain totals</h2>
            {on ? (
              <dl className="mt-3 space-y-3 text-sm">
                <Row label="Patients">{on.patients}</Row>
                <Row label="Doctors">{on.doctors}</Row>
                <Row label="Records">{on.records}</Row>
                <Row label="Access requests">{on.requests}</Row>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Contract not reachable. Deploy it and set <code className="mono">CONTRACT_ADDRESS</code>.
              </p>
            )}
          </div>
        </div>

        {/* Blockchain activity */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Latest blockchain events</h2>
              <Link to="/admin/activity" className="link text-sm">
                View all
              </Link>
            </div>

            {events.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">
                No contract events found yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {events.map((e, i) => (
                  <li key={`${e.txHash}-${i}`} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <span className="badge-blue">{e.event}</span>
                      <p className="mono mt-1 truncate text-[11px] text-slate-500">
                        {Object.entries(e.args || {})
                          .slice(0, 2)
                          .map(([k, v]) => `${k}=${String(v).slice(0, 18)}`)
                          .join("  ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <TxLink hash={e.txHash} label={`#${e.blockNumber}`} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card mt-5">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Recent application activity</h2>
              <Link to="/admin/audit" className="link text-sm">
                View audit log
              </Link>
            </div>
            {logs.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {l.action.replace(/_/g, " ")}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{l.detail}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(l.at)}</span>
                    </div>
                    {l.actor && (
                      <div className="mt-1">
                        <Address value={l.actor} link={false} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}
