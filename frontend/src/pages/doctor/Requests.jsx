import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import {
  PageHeader, Alert, Spinner, EmptyState, Address, formatDate,
} from "../../components/ui";
import { api } from "../../lib/api";
import { REQUEST_STATUS } from "../../lib/records";
import { humanError } from "../../lib/web3";

export default function DoctorRequests() {
  return (
    <RequireWallet>
      <RequestsInner />
    </RequireWallet>
  );
}

function RequestsInner() {
  const { wallet, contract } = useApp();

  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await contract();
      const raw = await c.getDoctorRequests(wallet.address);

      const list = raw
        .map((r) => ({
          id: Number(r.id),
          recordId: Number(r.recordId),
          patient: r.patient,
          reason: r.reason,
          status: Number(r.status),
          requestedAt: Number(r.requestedAt),
          resolvedAt: Number(r.resolvedAt),
        }))
        .sort((a, b) => b.requestedAt - a.requestedAt);
      setRequests(list);

      const map = {};
      await Promise.all(
        [...new Set(list.map((r) => r.patient.toLowerCase()))].map(async (addr) => {
          try {
            const { user } = await api.userByWallet(addr);
            map[addr] = user;
          } catch {
            map[addr] = { name: "Unknown patient", walletAddress: addr };
          }
        })
      );
      setProfiles(map);
      setError("");
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }, [contract, wallet]);

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

  const counts = {
    pending: requests.filter((r) => r.status === 1).length,
    approved: requests.filter((r) => r.status === 2).length,
    rejected: requests.filter((r) => r.status === 3).length,
    revoked: requests.filter((r) => r.status === 4).length,
  };

  return (
    <div>
      <PageHeader title="My access requests" subtitle="Requests you have sent to patients.">
        <Link to="/doctor/patients" className="btn-primary btn-sm">
          + New request
        </Link>
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Pending", counts.pending, "badge-amber"],
          ["Approved", counts.approved, "badge-green"],
          ["Rejected", counts.rejected, "badge-red"],
          ["Revoked", counts.revoked, "badge-slate"],
        ].map(([label, n, cls]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">{n}</span>
              <span className={cls}>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon="&#128233;"
          title="You have not requested access yet"
          action={
            <Link to="/doctor/patients" className="btn-primary">
              Find a patient
            </Link>
          }
        >
          Search for a patient and explain why you need their records.
        </EmptyState>
      ) : (
        <div className="table-wrap bg-white">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Patient</th>
                <th>Reason</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Requested</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const p = profiles[r.patient.toLowerCase()] || {};
                const s = REQUEST_STATUS[r.status] || REQUEST_STATUS[0];
                return (
                  <tr key={r.id}>
                    <td className="font-medium text-slate-700">{r.id}</td>
                    <td>
                      <div className="font-medium text-slate-800">{p.name || "Unknown"}</div>
                      <Address value={r.patient} />
                    </td>
                    <td className="max-w-xs">
                      <p className="truncate text-slate-600" title={r.reason}>
                        {r.reason || "-"}
                      </p>
                    </td>
                    <td className="text-slate-600">
                      {r.recordId === 0 ? "All records" : `#${r.recordId}`}
                    </td>
                    <td>
                      <span className={s.cls}>{s.label}</span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">
                      {formatDate(r.requestedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {counts.approved > 0 && (
        <div className="mt-6">
          <Alert kind="success" title="You have approved access">
            <Link to="/doctor/records" className="link font-semibold">
              Open authorized records &rarr;
            </Link>
          </Alert>
        </div>
      )}
    </div>
  );
}
