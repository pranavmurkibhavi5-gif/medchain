import { useEffect, useMemo, useState } from "react";
import { PageHeader, Alert, Spinner, EmptyState, Address, TxLink, formatDate } from "../../components/ui";
import { api } from "../../lib/api";

const STYLE = {
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
  RECORD_VIEWED: "badge-blue",
  USER_REGISTERED: "badge-slate",
  USER_LOGIN: "badge-slate",
  WALLET_LINKED: "badge-slate",
  ADMIN_UPDATED_USER: "badge-amber",
};

const ALL = "All actions";

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState(ALL);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { logs } = await api.adminAudit(500);
      setLogs(logs);
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

  const actions = useMemo(() => [ALL, ...new Set(logs.map((l) => l.action))], [logs]);

  const filtered = logs.filter((l) => {
    if (filter !== ALL && l.action !== filter) return false;
    const t = query.trim().toLowerCase();
    if (!t) return true;
    return (
      (l.detail || "").toLowerCase().includes(t) ||
      (l.actor || "").includes(t) ||
      (l.target || "").includes(t)
    );
  });

  const exportCsv = () => {
    const header = ["timestamp", "action", "actor", "actorRole", "target", "recordId", "txHash", "detail"];
    const rows = filtered.map((l) =>
      [l.at, l.action, l.actor, l.actorRole, l.target, l.recordId, l.txHash, `"${(l.detail || "").replace(/"/g, "'")}"`].join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medchain-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const denied = logs.filter((l) => l.action === "ACCESS_DENIED" || l.action === "INTEGRITY_FAILURE").length;

  return (
    <div>
      <PageHeader
        title="Audit logs"
        subtitle={`${logs.length} recorded action(s) across the application`}
      >
        <button onClick={exportCsv} className="btn-ghost btn-sm">
          Export CSV
        </button>
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {denied > 0 && (
        <div className="mb-5">
          <Alert kind="warn" title={`${denied} denied access or integrity event(s)`}>
            Filter by <strong>ACCESS_DENIED</strong> or <strong>INTEGRITY_FAILURE</strong> to inspect them.
          </Alert>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {actions.slice(0, 10).map((a) => (
            <button
              key={a}
              onClick={() => setFilter(a)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                filter === a ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {a.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <input
          className="input lg:max-w-xs"
          placeholder="Search details or addresses..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="&#128203;" title="No log entries match" />
      ) : (
        <div className="table-wrap bg-white">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Record</th>
                <th>Detail</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{formatDate(l.at)}</td>
                  <td>
                    <span className={STYLE[l.action] || "badge-slate"}>
                      {l.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    {l.actor ? <Address value={l.actor} /> : <span className="text-xs text-slate-400">system</span>}
                    {l.actorRole && (
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        {l.actorRole}
                      </div>
                    )}
                  </td>
                  <td>
                    {l.target ? <Address value={l.target} /> : <span className="text-xs text-slate-400">-</span>}
                  </td>
                  <td className="text-slate-600">{l.recordId > 0 ? `#${l.recordId}` : "-"}</td>
                  <td className="max-w-xs">
                    <p className="truncate text-xs text-slate-600" title={l.detail}>
                      {l.detail}
                    </p>
                  </td>
                  <td>{l.txHash ? <TxLink hash={l.txHash} label="View" /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
