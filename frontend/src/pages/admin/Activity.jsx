import { useEffect, useState } from "react";
import { PageHeader, Alert, Spinner, EmptyState, Address, TxLink } from "../../components/ui";
import { api } from "../../lib/api";
import { CONTRACT_ADDRESS, addressUrl } from "../../lib/web3";

const STYLE = {
  RecordUploaded: "badge-blue",
  AccessRequested: "badge-amber",
  AccessGranted: "badge-green",
  AccessRejected: "badge-red",
  AccessRevoked: "badge-red",
  AccessDenied: "badge-red",
  RecordViewed: "badge-blue",
  RecordDeactivated: "badge-slate",
  PatientRegistered: "badge-slate",
  DoctorRegistered: "badge-slate",
  DoctorVerified: "badge-slate",
};

const ALL = "All events";

export default function AdminActivity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [filter, setFilter] = useState(ALL);

  const load = async () => {
    setLoading(true);
    try {
      const { events, contractConfigured } = await api.adminActivity(120);
      setEvents(events || []);
      setConfigured(contractConfigured !== false);
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

  const kinds = [ALL, ...new Set(events.map((e) => e.event))];
  const filtered = filter === ALL ? events : events.filter((e) => e.event === filter);

  return (
    <div>
      <PageHeader
        title="Blockchain activity"
        subtitle="The immutable audit trail, read directly from the smart contract's event log."
      >
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {!configured && (
        <div className="mb-5">
          <Alert kind="warn" title="Contract not configured">
            Set <code className="mono">CONTRACT_ADDRESS</code> in the backend environment so events
            can be read from the chain.
          </Alert>
        </div>
      )}

      {CONTRACT_ADDRESS && (
        <div className="mb-5 card card-pad">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Contract under observation
          </p>
          <a
            href={addressUrl(CONTRACT_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="link mono mt-1 block break-all text-sm"
          >
            {CONTRACT_ADDRESS}
          </a>
        </div>
      )}

      {kinds.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === k ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="&#9939;" title="No blockchain events found">
          Events appear once users register, upload records or manage access on-chain.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((e, i) => (
            <div key={`${e.txHash}-${i}`} className="card card-pad animate-fade-up">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={STYLE[e.event] || "badge-slate"}>{e.event}</span>
                    <span className="text-xs text-slate-400">Block #{e.blockNumber}</span>
                  </div>

                  <dl className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                    {Object.entries(e.args || {}).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="shrink-0 font-semibold text-slate-500">{k}</dt>
                        <dd className="min-w-0 text-slate-700">
                          {String(v).startsWith("0x") && String(v).length === 42 ? (
                            <Address value={v} />
                          ) : (
                            <span className="mono break-all">{String(v)}</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <TxLink hash={e.txHash} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
