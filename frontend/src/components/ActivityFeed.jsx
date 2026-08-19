/**
 * Two-column activity view shared by the patient and doctor pages:
 * the immutable on-chain event log next to the off-chain application log.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader, Alert, Spinner, EmptyState, Address, TxLink, formatDate, timeAgo } from "./ui";

const ACTION_STYLE = {
  RECORD_UPLOADED: "badge-blue",
  CHAIN_REGISTERED: "badge-blue",
  IPFS_UPLOAD: "badge-slate",
  ACCESS_GRANTED: "badge-green",
  KEY_SHARED: "badge-green",
  ACCESS_REQUESTED: "badge-amber",
  ACCESS_REJECTED: "badge-red",
  ACCESS_REVOKED: "badge-red",
  ACCESS_DENIED: "badge-red",
  INTEGRITY_FAILURE: "badge-red",
  RECORD_ACCESSED: "badge-blue",
  RECORD_DECRYPTED: "badge-slate",
  USER_LOGIN: "badge-slate",
  WALLET_LINKED: "badge-slate",
};

const EVENT_STYLE = {
  RecordUploaded: "badge-blue",
  AccessRequested: "badge-amber",
  AccessGranted: "badge-green",
  AccessRejected: "badge-red",
  AccessRevoked: "badge-red",
  AccessDenied: "badge-red",
  RecordViewed: "badge-blue",
  PatientRegistered: "badge-slate",
  DoctorRegistered: "badge-slate",
};

export default function ActivityFeed({ title, subtitle }) {
  const [logs, setLogs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.myAudit(150).catch(() => ({ logs: [] })),
        api.chainEvents(50).catch(() => ({ events: [] })),
      ]);
      setLogs(a.logs || []);
      setEvents(b.events || []);
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

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* On-chain */}
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Blockchain events</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Immutable. Written by the smart contract, editable by nobody.
            </p>
          </div>

          {events.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="&#9939;" title="No on-chain events yet">
                Events appear here once transactions are mined on the contract.
              </EmptyState>
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {events.map((e, i) => (
                <li key={`${e.txHash}-${i}`} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={EVENT_STYLE[e.event] || "badge-slate"}>{e.event}</span>
                    <TxLink hash={e.txHash} label={`Block ${e.blockNumber}`} />
                  </div>
                  <dl className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                    {Object.entries(e.args || {})
                      .filter(([k]) => k !== "timestamp")
                      .slice(0, 4)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="shrink-0 font-medium">{k}:</dt>
                          <dd className="mono truncate text-slate-600" title={v}>
                            {String(v).startsWith("0x") && String(v).length === 42 ? (
                              <Address value={v} link={false} />
                            ) : (
                              String(v)
                            )}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Off-chain */}
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Application log</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Everything involving your wallet, including denied attempts.
            </p>
          </div>

          {logs.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="&#128203;" title="No activity recorded yet" />
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {logs.map((l) => (
                <li key={l.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={ACTION_STYLE[l.action] || "badge-slate"}>
                      {l.action.replace(/_/g, " ")}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400" title={formatDate(l.at)}>
                      {timeAgo(l.at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{l.detail}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {l.recordId > 0 && <span>Record #{l.recordId}</span>}
                    {l.target && <Address value={l.target} link={false} />}
                    {l.txHash && <TxLink hash={l.txHash} label="Tx" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
