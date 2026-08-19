import { useEffect, useState } from "react";
import { PageHeader, Alert, Spinner, EmptyState, Address, formatDate } from "../../components/ui";
import { api } from "../../lib/api";

const TABS = [
  { key: "", label: "All users" },
  { key: "patient", label: "Patients" },
  { key: "doctor", label: "Doctors" },
  { key: "admin", label: "Admins" },
];

export default function AdminUsers() {
  const [role, setRole] = useState("");
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async (r = role) => {
    setLoading(true);
    try {
      const { users } = await api.adminUsers(r);
      setUsers(users);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const patch = async (user, body) => {
    setBusyId(user.id);
    try {
      await api.adminUpdateUser(user.id, body);
      await load(role);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = users.filter((u) => {
    const t = query.trim().toLowerCase();
    if (!t) return true;
    return (
      u.name.toLowerCase().includes(t) ||
      u.email.toLowerCase().includes(t) ||
      (u.walletAddress || "").includes(t)
    );
  });

  return (
    <div>
      <PageHeader title="Users" subtitle="Every registered patient, doctor and administrator.">
        <button onClick={() => load(role)} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRole(t.key)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                role === t.key ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="input sm:max-w-xs"
          placeholder="Filter by name, email or wallet..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="&#128101;" title="No users match that filter" />
      ) : (
        <div className="table-wrap bg-white">
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Wallet</th>
                <th>Details</th>
                <th>Registered</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td>
                    <span
                      className={
                        u.role === "doctor"
                          ? "badge-blue"
                          : u.role === "admin"
                          ? "badge-amber"
                          : "badge-slate"
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {u.walletAddress ? (
                      <Address value={u.walletAddress} />
                    ) : (
                      <span className="text-xs text-slate-400">Not linked</span>
                    )}
                  </td>
                  <td className="text-xs text-slate-600">
                    {u.role === "doctor" ? (
                      <>
                        <div>{u.specialization || "General practice"}</div>
                        <div className="mono text-slate-400">{u.licenseId}</div>
                      </>
                    ) : u.role === "patient" ? (
                      <div>{u.bloodGroup ? `Blood group ${u.bloodGroup}` : "-"}</div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(u.createdAt)}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      {u.active ? (
                        <span className="badge-green">Active</span>
                      ) : (
                        <span className="badge-red">Disabled</span>
                      )}
                      {u.role === "doctor" &&
                        (u.verified ? (
                          <span className="badge-blue">Verified</span>
                        ) : (
                          <span className="badge-amber">Unverified</span>
                        ))}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {u.role === "doctor" && (
                        <button
                          onClick={() => patch(u, { verified: !u.verified })}
                          disabled={busyId === u.id}
                          className="btn-ghost btn-sm"
                        >
                          {u.verified ? "Unverify" : "Verify"}
                        </button>
                      )}
                      {u.role !== "admin" && (
                        <button
                          onClick={() => patch(u, { active: !u.active })}
                          disabled={busyId === u.id}
                          className={u.active ? "btn-danger btn-sm" : "btn-success btn-sm"}
                        >
                          {busyId === u.id ? <Spinner className="h-3 w-3" /> : null}
                          {u.active ? "Disable" : "Enable"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Verifying a doctor is a licence check shown in the UI. It never grants access to any record -
        only a patient can do that, on-chain.
      </p>
    </div>
  );
}
