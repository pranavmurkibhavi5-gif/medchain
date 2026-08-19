import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  PageHeader, StatCard, Alert, Spinner, EmptyState, Address, timeAgo,
} from "../../components/ui";
import { api } from "../../lib/api";
import { CONTRACT_ADDRESS, NETWORK_NAME, humanError } from "../../lib/web3";

export default function DoctorDashboard() {
  const { user, wallet, keyPair, contract, connect, walletBusy } = useApp();

  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [authorised, setAuthorised] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!wallet || !CONTRACT_ADDRESS) {
        setLoading(false);
        return;
      }
      try {
        const c = await contract();
        const [raw, { logs }, { patients }] = await Promise.all([
          c.getDoctorRequests(wallet.address),
          api.myAudit(8).catch(() => ({ logs: [] })),
          api.patients("").catch(() => ({ patients: [] })),
        ]);
        if (cancelled) return;

        setStats({
          pending: raw.filter((r) => Number(r.status) === 1).length,
          approved: raw.filter((r) => Number(r.status) === 2).length,
          rejected: raw.filter((r) => Number(r.status) === 3).length,
        });
        setActivity(logs);

        const ok = [];
        await Promise.all(
          patients.map(async (p) => {
            try {
              if (await c.hasAccess(p.walletAddress, wallet.address, 0n)) ok.push(p);
            } catch {
              /* skip */
            }
          })
        );
        if (!cancelled) setAuthorised(ok);
      } catch (err) {
        if (!cancelled) setError(humanError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, contract]);

  return (
    <div>
      <PageHeader
        title={`Dr. ${user?.name?.replace(/^Dr\.?\s*/i, "") || ""}`}
        subtitle={user?.specialization ? `${user.specialization}${user.hospital ? ` · ${user.hospital}` : ""}` : "Doctor dashboard"}
      >
        <Link to="/doctor/patients" className="btn-primary btn-sm">
          Find a patient
        </Link>
      </PageHeader>

      {!wallet && (
        <div className="mb-6">
          <Alert kind="warn" title="Connect MetaMask to request access">
            <p>
              Access requests are on-chain transactions signed by your wallet, which also proves your
              identity to patients.
            </p>
            <button onClick={connect} disabled={walletBusy} className="btn-primary btn-sm mt-3">
              {walletBusy ? <Spinner className="h-3 w-3" /> : null} Connect MetaMask
            </button>
          </Alert>
        </div>
      )}

      {wallet && !keyPair && (
        <div className="mb-6">
          <Alert kind="warn" title="Encryption key locked">
            Sign the free unlock message before opening any authorized record.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-6">
          <Alert kind="error" onClose={() => setError("")}>{error}</Alert>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Patients I can read"
          value={authorised.length}
          hint="Granted on-chain"
          icon="&#128101;"
          tone="emerald"
        />
        <StatCard
          label="Pending requests"
          value={stats.pending}
          hint="Awaiting patient decision"
          icon="&#8987;"
          tone="amber"
        />
        <StatCard label="Approved" value={stats.approved} hint="Requests accepted" icon="&#9989;" />
        <StatCard
          label="Network"
          value={NETWORK_NAME.split(" ")[0]}
          hint="Public Ethereum testnet"
          icon="&#9939;"
          tone="violet"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Patients who granted you access</h2>
              <Link to="/doctor/records" className="link text-sm">
                Open records
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : authorised.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="&#128274;"
                  title="No authorizations yet"
                  action={
                    <Link to="/doctor/patients" className="btn-primary">
                      Request access
                    </Link>
                  }
                >
                  You can only read a patient's records after they approve your request on-chain.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {authorised.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{p.name}</p>
                      <Address value={p.walletAddress} />
                    </div>
                    <Link to="/doctor/records" className="btn-ghost btn-sm shrink-0">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Your credentials</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Licence ID</dt>
                <dd className="mono text-slate-800">{user?.licenseId || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Specialization</dt>
                <dd className="text-slate-800">{user?.specialization || "General practice"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Verification</dt>
                <dd>
                  {user?.verified ? (
                    <span className="badge-green">Verified by admin</span>
                  ) : (
                    <span className="badge-amber">Pending verification</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Wallet</dt>
                <dd className="mt-0.5">
                  {wallet ? <Address value={wallet.address} /> : <span className="text-slate-400">Not connected</span>}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Recent activity</h2>
            </div>
            {activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <p className="text-xs font-semibold text-slate-700">
                      {l.action.replace(/_/g, " ").toLowerCase()}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{l.detail}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{timeAgo(l.at)}</p>
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
