/**
 * Direct grant / revoke, without waiting for a doctor to ask.
 *
 * Revoking removes BOTH halves of access: the on-chain permission (so the
 * contract refuses) and the stored key envelopes (so even a cached CID is
 * useless without the AES key).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import {
  PageHeader, Alert, Spinner, EmptyState, Address, Modal, formatDate,
} from "../../components/ui";
import { api } from "../../lib/api";
import { shareAllRecordKeys } from "../../lib/records";
import { waitForTx, humanError } from "../../lib/web3";

export default function Permissions() {
  return (
    <RequireWallet>
      <PermissionsInner />
    </RequireWallet>
  );
}

function PermissionsInner() {
  const { wallet, keyPair, contract, notify } = useApp();

  const [granted, setGranted] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await contract();
      const [wallets, active] = await c.getGrantedDoctors(wallet.address);

      const rows = wallets.map((w, i) => ({ address: w, active: active[i] }));
      setGranted(rows);

      const map = {};
      await Promise.all(
        rows.map(async (r) => {
          try {
            const { user } = await api.userByWallet(r.address);
            map[r.address.toLowerCase()] = user;
          } catch {
            map[r.address.toLowerCase()] = { name: "Unregistered", walletAddress: r.address };
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

  useEffect(() => {
    if (!pickerOpen) return;
    api.doctors(search).then(({ doctors }) => setDirectory(doctors)).catch(() => {});
  }, [pickerOpen, search]);

  const grantedSet = useMemo(
    () => new Set(granted.filter((g) => g.active).map((g) => g.address.toLowerCase())),
    [granted]
  );

  const grant = async (doctor) => {
    setBusy(doctor.walletAddress);
    setProgress("Waiting for MetaMask...");
    try {
      if (!doctor.encryptionPublicKey) {
        throw new Error(
          "That doctor has not connected a wallet yet, so their encryption key is unknown."
        );
      }

      const c = await contract();
      const tx = await c.grantAccess(doctor.walletAddress, 0n);
      setProgress("Confirming on the blockchain...");
      const receipt = await waitForTx(tx);

      setProgress("Sharing decryption keys...");
      const { records } = await api.myRecords();
      const { shared } = await shareAllRecordKeys(
        records,
        doctor.walletAddress,
        doctor.encryptionPublicKey,
        keyPair,
        (done, total) => setProgress(`Sharing decryption keys (${done}/${total})...`)
      );

      await api.logAudit({
        action: "ACCESS_GRANTED",
        target: doctor.walletAddress,
        txHash: receipt.hash,
        detail: `Granted chart-wide access; ${shared} key(s) shared`,
      }).catch(() => {});

      notify(`${doctor.name} can now read your records`, "success");
      setPickerOpen(false);
      await load();
    } catch (err) {
      notify(humanError(err), "error");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const revoke = async (address) => {
    setBusy(address);
    setProgress("Waiting for MetaMask...");
    try {
      const c = await contract();
      const tx = await c.revokeAccess(address, 0n);
      setProgress("Confirming on the blockchain...");
      const receipt = await waitForTx(tx);

      // Remove the sealed keys as well - belt and braces.
      setProgress("Destroying shared decryption keys...");
      await api.revokeKeys({ doctorAddress: address });

      await api.logAudit({
        action: "ACCESS_REVOKED",
        target: address,
        txHash: receipt.hash,
        detail: "Chart-wide access revoked and keys destroyed",
      }).catch(() => {});

      notify("Access revoked - the doctor can no longer read your records", "success");
      await load();
    } catch (err) {
      notify(humanError(err), "error");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  const activeGrants = granted.filter((g) => g.active);
  const revoked = granted.filter((g) => !g.active);

  return (
    <div>
      <PageHeader
        title="Who can read my records"
        subtitle="Grant access directly, or revoke it at any time. Enforced by the smart contract."
      >
        <button onClick={() => setPickerOpen(true)} className="btn-primary btn-sm">
          + Grant access
        </button>
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {progress && (
        <div className="mb-4">
          <Alert kind="info">{progress}</Alert>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Active permissions
        </h2>

        {activeGrants.length === 0 ? (
          <EmptyState
            icon="&#128274;"
            title="No doctor can read your records"
            action={
              <button onClick={() => setPickerOpen(true)} className="btn-primary">
                Grant access to a doctor
              </button>
            }
          >
            Your records are readable only by you until you grant access.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeGrants.map((g) => {
              const p = profiles[g.address.toLowerCase()] || {};
              return (
                <div key={g.address} className="card card-pad animate-fade-up">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{p.name || "Unknown"}</p>
                        <span className="badge-green">Active</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.specialization || "General practice"}
                        {p.hospital ? ` · ${p.hospital}` : ""}
                      </p>
                      <div className="mt-2">
                        <Address value={g.address} />
                      </div>
                    </div>
                    <button
                      onClick={() => revoke(g.address)}
                      disabled={busy === g.address}
                      className="btn-danger btn-sm shrink-0"
                    >
                      {busy === g.address ? <Spinner className="h-3 w-3" /> : null} Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {revoked.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Previously granted (now revoked)
          </h2>
          <div className="table-wrap bg-white">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {revoked.map((g) => {
                  const p = profiles[g.address.toLowerCase()] || {};
                  return (
                    <tr key={g.address}>
                      <td className="font-medium text-slate-700">{p.name || "Unknown"}</td>
                      <td>
                        <Address value={g.address} />
                      </td>
                      <td>
                        <span className="badge-slate">Revoked</span>
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => grant({ ...p, walletAddress: g.address })}
                          disabled={busy === g.address || !p.encryptionPublicKey}
                          className="btn-ghost btn-sm"
                        >
                          Re-grant
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Doctor picker */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Grant access to a doctor">
        <input
          className="input"
          placeholder="Search by name, email or wallet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="mt-4 space-y-2">
          {directory.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              No registered doctors with a linked wallet found.
            </p>
          )}

          {directory.map((d) => {
            const already = grantedSet.has(d.walletAddress?.toLowerCase());
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{d.name}</p>
                    {d.verified && <span className="badge-green">Verified</span>}
                    {!d.encryptionPublicKey && <span className="badge-amber">No wallet key</span>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {d.specialization || "General practice"}
                    {d.licenseId ? ` · ${d.licenseId}` : ""}
                  </p>
                  <div className="mt-1">
                    <Address value={d.walletAddress} />
                  </div>
                </div>

                {already ? (
                  <span className="badge-green shrink-0">Granted</span>
                ) : (
                  <button
                    onClick={() => grant(d)}
                    disabled={busy === d.walletAddress || !d.encryptionPublicKey}
                    className="btn-primary btn-sm shrink-0"
                  >
                    {busy === d.walletAddress ? <Spinner className="h-3 w-3" /> : null} Grant
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
