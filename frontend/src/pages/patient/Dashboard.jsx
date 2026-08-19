import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  PageHeader, StatCard, Alert, Spinner, EmptyState, Address, TxLink, timeAgo,
} from "../../components/ui";
import { api } from "../../lib/api";
import { CONTRACT_ADDRESS, NETWORK_NAME, humanError } from "../../lib/web3";
import { formatBytes } from "../../lib/crypto";

export default function PatientDashboard() {
  const { user, wallet, keyPair, contract, connect, walletBusy } = useApp();

  const [records, setRecords] = useState([]);
  const [pending, setPending] = useState(0);
  const [grants, setGrants] = useState(0);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!wallet) {
        setLoading(false);
        return;
      }
      try {
        const [{ records }, { logs }] = await Promise.all([
          api.myRecords().catch(() => ({ records: [] })),
          api.myAudit(8).catch(() => ({ logs: [] })),
        ]);
        if (cancelled) return;
        setRecords(records);
        setActivity(logs);

        if (CONTRACT_ADDRESS) {
          const c = await contract();
          const [reqs, [, active]] = await Promise.all([
            c.getPatientRequests(wallet.address),
            c.getGrantedDoctors(wallet.address),
          ]);
          if (cancelled) return;
          setPending(reqs.filter((r) => Number(r.status) === 1).length);
          setGrants(active.filter(Boolean).length);
        }
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

  const totalBytes = records.reduce((sum, r) => sum + (r.fileSize || 0), 0);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] || "there"}`}
        subtitle="Your records are encrypted in your browser and anchored to the blockchain."
      >
        <Link to="/patient/upload" className="btn-primary btn-sm">
          + Upload record
        </Link>
      </PageHeader>

      {!wallet && (
        <div className="mb-6">
          <Alert kind="warn" title="Connect MetaMask to get started">
            <p>
              Your wallet is your on-chain identity. Connect it once to upload records and manage who
              can read them.
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
            Sign the free unlock message to read or share your records.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-6">
          <Alert kind="error" onClose={() => setError("")}>{error}</Alert>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My records" value={records.length} hint={formatBytes(totalBytes)} icon="&#128193;" />
        <StatCard
          label="Pending requests"
          value={pending}
          hint={pending ? "Needs your decision" : "All clear"}
          icon="&#128276;"
          tone={pending ? "amber" : "emerald"}
        />
        <StatCard label="Doctors with access" value={grants} hint="Revocable any time" icon="&#128104;&#8205;&#9877;&#65039;" tone="violet" />
        <StatCard label="Network" value={NETWORK_NAME.split(" ")[0]} hint="Public Ethereum testnet" icon="&#9939;" tone="emerald" />
      </div>

      {pending > 0 && (
        <div className="mb-6">
          <Alert kind="warn" title={`${pending} doctor${pending === 1 ? "" : "s"} waiting for your decision`}>
            <Link to="/patient/requests" className="link font-semibold">
              Review the requests &rarr;
            </Link>
          </Alert>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent records */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Recent records</h2>
              <Link to="/patient/records" className="link text-sm">
                View all
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : records.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="&#128193;"
                  title="No records yet"
                  action={
                    <Link to="/patient/upload" className="btn-primary">
                      Upload your first record
                    </Link>
                  }
                >
                  Everything you upload is encrypted before it leaves this device.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {records.slice(0, 6).map((r) => (
                  <li key={r.recordId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{r.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {r.recordType} &middot; {formatBytes(r.fileSize)} &middot; {timeAgo(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="badge-blue">#{r.recordId}</span>
                      {r.txHash && <TxLink hash={r.txHash} label="Tx" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="font-semibold text-slate-900">Your identity</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Name</dt>
                <dd className="font-medium text-slate-800">{user?.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="truncate text-slate-800">{user?.email}</dd>
              </div>
              {user?.bloodGroup && (
                <div>
                  <dt className="text-xs text-slate-500">Blood group</dt>
                  <dd className="text-slate-800">{user.bloodGroup}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Wallet</dt>
                <dd className="mt-0.5">
                  {wallet ? <Address value={wallet.address} /> : <span className="text-slate-400">Not connected</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Encryption key</dt>
                <dd>
                  {keyPair ? (
                    <span className="badge-green">Unlocked</span>
                  ) : (
                    <span className="badge-amber">Locked</span>
                  )}
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
