import { useEffect, useState } from "react";
import { PageHeader, Alert, Spinner, EmptyState, Address, TxLink, formatDate } from "../../components/ui";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/crypto";

export default function AdminRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { records } = await api.adminRecords();
      setRecords(records);
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

  const filtered = records.filter((r) => {
    const t = query.trim().toLowerCase();
    if (!t) return true;
    return (
      (r.fileName || "").toLowerCase().includes(t) ||
      (r.recordType || "").toLowerCase().includes(t) ||
      (r.owner || "").includes(t) ||
      (r.cid || "").toLowerCase().includes(t)
    );
  });

  const totalBytes = records.reduce((s, r) => s + (r.fileSize || 0), 0);

  return (
    <div>
      <PageHeader
        title="Records"
        subtitle={`${records.length} record(s) · ${formatBytes(totalBytes)} of encrypted data anchored on-chain`}
      >
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      <div className="mb-4">
        <Alert kind="info" title="Metadata only">
          Administrators see that a record exists and can verify its hash, but hold no decryption
          key. The medical content is unreadable from this console.
        </Alert>
      </div>

      <input
        className="input mb-5 sm:max-w-md"
        placeholder="Filter by file name, type, owner or CID..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="&#128193;" title="No records to show" />
      ) : (
        <div className="table-wrap bg-white">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>File</th>
                <th>Owner</th>
                <th>IPFS CID</th>
                <th>Integrity hash</th>
                <th>Shared</th>
                <th>Uploaded</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold text-slate-700">#{r.recordId}</td>
                  <td>
                    <div className="max-w-[180px] truncate font-medium text-slate-800" title={r.fileName}>
                      {r.fileName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.recordType} &middot; {formatBytes(r.fileSize)}
                    </div>
                  </td>
                  <td>
                    <Address value={r.owner} />
                  </td>
                  <td>
                    <code className="mono block max-w-[150px] truncate text-slate-600" title={r.cid}>
                      {r.cid}
                    </code>
                  </td>
                  <td>
                    <code className="mono block max-w-[150px] truncate text-slate-600" title={r.dataHash}>
                      {r.dataHash}
                    </code>
                  </td>
                  <td className="text-center text-slate-600">
                    {Math.max(0, (r.sharedWithCount || 1) - 1)}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(r.createdAt)}
                  </td>
                  <td>{r.txHash ? <TxLink hash={r.txHash} label="View" /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
