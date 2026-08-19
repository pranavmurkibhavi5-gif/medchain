/**
 * Doctor: search the patient directory and raise an access request.
 * Requesting is an on-chain transaction, so the patient sees it immediately and
 * the request itself is part of the permanent audit trail.
 */
import { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import {
  PageHeader, Alert, Spinner, EmptyState, Address, Modal, TxLink,
} from "../../components/ui";
import { api } from "../../lib/api";
import { waitForTx, humanError } from "../../lib/web3";

export default function FindPatient() {
  return (
    <RequireWallet>
      <FindInner />
    </RequireWallet>
  );
}

function FindInner() {
  const { wallet, contract, notify } = useApp();

  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [access, setAccess] = useState({}); // wallet -> bool

  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  const search = async (term = query) => {
    setLoading(true);
    try {
      const { patients } = await api.patients(term);
      setPatients(patients);
      setError("");

      // Ask the contract which of these already granted us access.
      const c = await contract();
      const entries = await Promise.all(
        patients.map(async (p) => {
          try {
            return [p.walletAddress.toLowerCase(), await c.hasAccess(p.walletAddress, wallet.address, 0n)];
          } catch {
            return [p.walletAddress.toLowerCase(), false];
          }
        })
      );
      setAccess(Object.fromEntries(entries));
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendRequest = async () => {
    if (!reason.trim()) return notify("Give the patient a reason for the request", "warn");
    setBusy(true);
    try {
      const c = await contract();
      const tx = await c.requestAccess(target.walletAddress, 0n, reason.trim());
      const receipt = await waitForTx(tx);

      await api.logAudit({
        action: "ACCESS_REQUESTED",
        target: target.walletAddress,
        txHash: receipt.hash,
        detail: `Requested access to ${target.name}'s records: ${reason.trim()}`,
      }).catch(() => {});

      setSent({ ...receipt, patient: target.name });
      notify("Request sent - the patient will see it on their dashboard", "success");
    } catch (err) {
      notify(humanError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const closeModal = () => {
    setTarget(null);
    setReason("");
    setSent(null);
  };

  return (
    <div>
      <PageHeader
        title="Find a patient"
        subtitle="Search registered patients and request access to their records."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="mb-6 flex gap-2"
      >
        <input
          className="input"
          placeholder="Search by name, email or wallet address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0">
          Search
        </button>
      </form>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : patients.length === 0 ? (
        <EmptyState icon="&#128269;" title="No patients found">
          Only patients who have registered and linked a MetaMask wallet appear here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {patients.map((p) => {
            const granted = access[p.walletAddress?.toLowerCase()];
            return (
              <div key={p.id} className="card card-pad flex flex-col animate-fade-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.bloodGroup ? `Blood group ${p.bloodGroup}` : "Patient"}
                    </p>
                  </div>
                  <span className="text-2xl">&#129333;</span>
                </div>

                <div className="mt-3">
                  <Address value={p.walletAddress} />
                </div>

                <div className="mt-auto flex items-center gap-2 pt-4">
                  {granted ? (
                    <span className="badge-green">Access granted</span>
                  ) : (
                    <button onClick={() => setTarget(p)} className="btn-primary btn-sm">
                      Request access
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Request modal */}
      <Modal
        open={Boolean(target)}
        onClose={closeModal}
        title={sent ? "Request sent" : `Request access to ${target?.name}'s records`}
        footer={
          sent ? (
            <button onClick={closeModal} className="btn-primary">
              Done
            </button>
          ) : (
            <>
              <button onClick={closeModal} className="btn-ghost">
                Cancel
              </button>
              <button onClick={sendRequest} disabled={busy} className="btn-primary">
                {busy ? <Spinner className="h-3.5 w-3.5" /> : null} Send request
              </button>
            </>
          )
        }
      >
        {sent ? (
          <div className="text-center">
            <div className="text-4xl">&#128231;</div>
            <p className="mt-3 font-semibold text-slate-900">
              Your request to {sent.patient} is on the blockchain
            </p>
            <p className="mt-1 text-sm text-slate-500">
              You will be able to read their records only if they approve.
            </p>
            <div className="mt-4 flex justify-center">
              <TxLink hash={sent.hash} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert kind="info">
              This request is recorded on-chain. The patient sees who asked, when, and why - and the
              decision is permanent and public.
            </Alert>

            <div>
              <label className="label">Reason for access</label>
              <textarea
                className="input min-h-[96px]"
                placeholder="e.g. Cardiology consultation scheduled for 24 August; need prior ECG and lab reports."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Be specific - patients approve requests they understand.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                <span className="font-semibold">Patient: </span>
                {target?.name}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Scope: </span>
                All records (chart-wide)
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
