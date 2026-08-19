/**
 * Incoming doctor access requests.
 *
 * Approving is two coordinated actions:
 *   1. approveRequest() on-chain  - the authoritative permission,
 *   2. re-sealing each record's AES key to the doctor's public key so they can
 *      actually decrypt what the chain now lets them fetch.
 *
 * Rejecting is a single on-chain transaction that also emits AccessDenied.
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import {
  PageHeader, Alert, Spinner, EmptyState, Address, TxLink, formatDate,
} from "../../components/ui";
import { api } from "../../lib/api";
import { REQUEST_STATUS, shareAllRecordKeys } from "../../lib/records";
import { waitForTx, humanError } from "../../lib/web3";

export default function PatientRequests() {
  return (
    <RequireWallet>
      <RequestsInner />
    </RequireWallet>
  );
}

function RequestsInner() {
  const { wallet, keyPair, contract, notify } = useApp();

  const [requests, setRequests] = useState([]);
  const [doctors, setDoctors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [progress, setProgress] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await contract();
      const raw = await c.getPatientRequests(wallet.address);

      const list = raw.map((r) => ({
        id: Number(r.id),
        recordId: Number(r.recordId),
        patient: r.patient,
        doctor: r.doctor,
        reason: r.reason,
        status: Number(r.status),
        requestedAt: Number(r.requestedAt),
        resolvedAt: Number(r.resolvedAt),
      }));
      list.sort((a, b) => b.requestedAt - a.requestedAt);
      setRequests(list);

      // Resolve doctor profiles for display + their public keys for sealing.
      const map = {};
      await Promise.all(
        [...new Set(list.map((r) => r.doctor.toLowerCase()))].map(async (addr) => {
          try {
            const { user } = await api.userByWallet(addr);
            map[addr] = user;
          } catch {
            try {
              const d = await c.getDoctor(addr);
              map[addr] = { name: d.name, specialization: d.specialization, walletAddress: addr };
            } catch {
              map[addr] = { name: "Unknown doctor", walletAddress: addr };
            }
          }
        })
      );
      setDoctors(map);
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

  const approve = async (req) => {
    setBusyId(req.id);
    setProgress("Waiting for MetaMask...");
    try {
      const doctor = doctors[req.doctor.toLowerCase()];
      if (!doctor?.encryptionPublicKey) {
        throw new Error(
          "This doctor has not linked a MetaMask wallet with an encryption key yet, so records cannot be shared with them. Ask them to sign in and connect their wallet."
        );
      }

      // 1. On-chain approval.
      const c = await contract();
      const tx = await c.approveRequest(BigInt(req.id));
      setProgress("Confirming transaction on the blockchain...");
      const receipt = await waitForTx(tx);

      // 2. Seal the record keys for the doctor.
      setProgress("Sharing decryption keys...");
      const { records } = await api.myRecords();
      const scope = req.recordId === 0 ? records : records.filter((r) => r.recordId === req.recordId);

      const { shared, failures } = await shareAllRecordKeys(
        scope,
        doctor.walletAddress,
        doctor.encryptionPublicKey,
        keyPair,
        (done, total) => setProgress(`Sharing decryption keys (${done}/${total})...`)
      );

      await api.logAudit({
        action: "ACCESS_GRANTED",
        target: doctor.walletAddress,
        recordId: req.recordId,
        txHash: receipt.hash,
        detail: `Approved request #${req.id}; ${shared} record key(s) shared`,
      }).catch(() => {});

      if (failures.length) {
        notify(`Approved, but ${failures.length} key(s) could not be shared`, "warn");
      } else {
        notify(`Access granted - ${shared} record(s) shared`, "success");
      }
      await load();
    } catch (err) {
      notify(humanError(err), "error");
    } finally {
      setBusyId(null);
      setProgress("");
    }
  };

  const reject = async (req) => {
    setBusyId(req.id);
    setProgress("Waiting for MetaMask...");
    try {
      const c = await contract();
      const tx = await c.rejectRequest(BigInt(req.id));
      setProgress("Confirming transaction...");
      const receipt = await waitForTx(tx);

      await api.logAudit({
        action: "ACCESS_REJECTED",
        target: req.doctor,
        recordId: req.recordId,
        txHash: receipt.hash,
        detail: `Rejected request #${req.id}`,
      }).catch(() => {});

      notify("Request rejected and logged on-chain", "success");
      await load();
    } catch (err) {
      notify(humanError(err), "error");
    } finally {
      setBusyId(null);
      setProgress("");
    }
  };

  const pending = requests.filter((r) => r.status === 1);
  const history = requests.filter((r) => r.status !== 1);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Access requests"
        subtitle="Doctors must ask before they can read anything. You decide."
      >
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {/* Pending */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Pending
          {pending.length > 0 && <span className="badge-amber">{pending.length}</span>}
        </h2>

        {pending.length === 0 ? (
          <EmptyState icon="&#9989;" title="Nothing waiting on you">
            New requests from doctors will appear here for approval.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => {
              const doc = doctors[req.doctor.toLowerCase()] || {};
              const busy = busyId === req.id;
              return (
                <div key={req.id} className="card card-pad animate-fade-up">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg">&#128105;&#8205;&#9877;&#65039;</span>
                        <p className="font-semibold text-slate-900">{doc.name || "Unknown doctor"}</p>
                        {doc.verified && <span className="badge-green">Verified</span>}
                        <span className="badge-slate">Request #{req.id}</span>
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {doc.specialization || "General practice"}
                        {doc.hospital ? ` · ${doc.hospital}` : ""}
                      </p>

                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-semibold">Reason: </span>
                        {req.reason || "(no reason given)"}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>
                          Scope:{" "}
                          <strong className="text-slate-700">
                            {req.recordId === 0 ? "All my records" : `Record #${req.recordId}`}
                          </strong>
                        </span>
                        <span>Requested {formatDate(req.requestedAt)}</span>
                        <Address value={req.doctor} />
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => approve(req)} disabled={busy} className="btn-success btn-sm">
                        {busy ? <Spinner className="h-3 w-3" /> : null} Approve
                      </button>
                      <button onClick={() => reject(req)} disabled={busy} className="btn-danger btn-sm">
                        Reject
                      </button>
                    </div>
                  </div>

                  {busy && progress && (
                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-medium text-brand-600">
                      {progress}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No resolved requests yet.</p>
        ) : (
          <div className="table-wrap bg-white">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Doctor</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const doc = doctors[r.doctor.toLowerCase()] || {};
                  const s = REQUEST_STATUS[r.status] || REQUEST_STATUS[0];
                  return (
                    <tr key={r.id}>
                      <td className="font-medium text-slate-700">#{r.id}</td>
                      <td>
                        <div className="font-medium text-slate-800">{doc.name || "Unknown"}</div>
                        <Address value={r.doctor} />
                      </td>
                      <td className="text-slate-600">
                        {r.recordId === 0 ? "All records" : `#${r.recordId}`}
                      </td>
                      <td>
                        <span className={s.cls}>{s.label}</span>
                      </td>
                      <td className="text-slate-500">
                        {r.resolvedAt ? formatDate(r.resolvedAt) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
