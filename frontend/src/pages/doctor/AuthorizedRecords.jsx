/**
 * Doctor: read the records of patients who granted access.
 *
 * Two independent gates must both pass before a byte is readable:
 *   1. the smart contract must say hasAccess(patient, doctor) - checked by the
 *      contract on read, and again by the API before it releases the key,
 *   2. the doctor must hold a key envelope sealed to their own public key.
 * Revoking either one makes the record unreadable.
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import {
  PageHeader, Alert, Spinner, EmptyState, Address, Modal, TxLink, formatDate,
} from "../../components/ui";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/crypto";
import { openRecord, downloadBlob, isPreviewable } from "../../lib/records";
import { humanError } from "../../lib/web3";

export default function AuthorizedRecords() {
  return (
    <RequireWallet>
      <AuthorizedInner />
    </RequireWallet>
  );
}

function AuthorizedInner() {
  const { wallet, keyPair, contract, notify } = useApp();

  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [active, setActive] = useState(null);
  const [opened, setOpened] = useState(null);

  // Which patients have granted this doctor access?
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await contract();
      const { patients: all } = await api.patients("");

      const authorised = [];
      await Promise.all(
        all.map(async (p) => {
          try {
            if (await c.hasAccess(p.walletAddress, wallet.address, 0n)) authorised.push(p);
          } catch {
            /* ignore individual failures */
          }
        })
      );
      setPatients(authorised);
      if (authorised.length === 1) setSelected(authorised[0]);
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
    if (!selected) return setRecords([]);
    let cancelled = false;
    setLoadingRecords(true);
    api
      .patientRecords(selected.walletAddress)
      .then(({ records }) => {
        if (!cancelled) setRecords(records);
      })
      .catch((err) => !cancelled && notify(err.message, "error"))
      .finally(() => !cancelled && setLoadingRecords(false));
    return () => {
      cancelled = true;
    };
  }, [selected, notify]);

  useEffect(() => {
    return () => {
      if (opened?.url) URL.revokeObjectURL(opened.url);
    };
  }, [opened]);

  const view = async (record) => {
    setBusyId(record.recordId);
    setActive(record);
    setOpened(null);
    try {
      // Write the access attempt to the chain first, so both allowed and
      // denied reads are permanently visible to the patient.
      const c = await contract();
      const tx = await c.logRecordAccess(BigInt(record.recordId));
      await tx.wait();

      const { blob, meta } = await openRecord(record, keyPair);
      setOpened({ blob, meta, url: URL.createObjectURL(blob) });

      api.logAudit({
        action: "RECORD_VIEWED",
        target: record.owner,
        recordId: record.recordId,
        txHash: tx.hash,
        detail: `Opened "${record.fileName}"`,
      }).catch(() => {});
    } catch (err) {
      notify(humanError(err), "error");
      setActive(null);
    } finally {
      setBusyId(null);
    }
  };

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
        title="Authorized records"
        subtitle="Only patients who granted you access appear here."
      >
        <button onClick={load} className="btn-ghost btn-sm">
          Refresh
        </button>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {patients.length === 0 ? (
        <EmptyState icon="&#128274;" title="No patient has granted you access yet">
          Search for a patient and send an access request. Once they approve, their records appear
          here automatically.
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-4">
          {/* Patient list */}
          <aside className="lg:col-span-1">
            <div className="card">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Patients ({patients.length})
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {patients.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p)}
                      className={`w-full px-4 py-3 text-left transition ${
                        selected?.id === p.id ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="mono mt-0.5 truncate text-[10px] text-slate-400">
                        {p.walletAddress}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Records */}
          <section className="lg:col-span-3">
            {!selected ? (
              <EmptyState icon="&#128100;" title="Select a patient" />
            ) : loadingRecords ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6 text-brand-600" />
              </div>
            ) : records.length === 0 ? (
              <EmptyState icon="&#128193;" title={`${selected.name} has not uploaded any records`} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {records.map((r) => (
                  <div key={r.recordId} className="card card-pad flex flex-col animate-fade-up">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{r.fileName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {r.recordType} &middot; {formatBytes(r.fileSize)}
                        </p>
                      </div>
                      <span className="badge-blue shrink-0">#{r.recordId}</span>
                    </div>

                    {r.notes && <p className="mt-2 text-xs italic text-slate-500">"{r.notes}"</p>}

                    <p className="mt-2 text-[11px] text-slate-400">
                      Uploaded {formatDate(r.createdAt)}
                    </p>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                      <button
                        onClick={() => view(r)}
                        disabled={busyId === r.recordId}
                        className="btn-primary btn-sm"
                      >
                        {busyId === r.recordId ? <Spinner className="h-3 w-3" /> : null} Open record
                      </button>
                      {r.txHash && <TxLink hash={r.txHash} label="Tx" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => {
          setActive(null);
          setOpened(null);
        }}
        title={active?.fileName || "Record"}
        wide
        footer={
          <>
            {opened && (
              <button
                onClick={() => downloadBlob(opened.blob, opened.meta.name || active.fileName)}
                className="btn-ghost"
              >
                Download
              </button>
            )}
            <button
              onClick={() => {
                setActive(null);
                setOpened(null);
              }}
              className="btn-primary"
            >
              Close
            </button>
          </>
        }
      >
        {!opened ? (
          <div className="flex flex-col items-center py-10">
            <Spinner className="h-7 w-7 text-brand-600" />
            <p className="mt-3 text-sm text-slate-500">
              Logging access on-chain, verifying hash, decrypting...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert kind="success" title="Access authorised and integrity verified">
              The patient granted you access on-chain, and this file hashes to exactly the value
              recorded on the blockchain.
            </Alert>

            <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2">
              <Field label="Record ID">#{active.recordId}</Field>
              <Field label="Type">{active.recordType}</Field>
              <Field label="Patient" full>
                <Address value={active.owner} />
              </Field>
              <Field label="On-chain hash" full>
                <code className="mono break-all">{active.dataHash}</code>
              </Field>
            </dl>

            <div className="rounded-xl border border-slate-200 bg-white">
              {isPreviewable(opened.meta.type) ? (
                opened.meta.type.startsWith("image/") ? (
                  <img src={opened.url} alt={active.fileName} className="mx-auto max-h-[45vh] rounded-xl" />
                ) : opened.meta.type === "application/pdf" ? (
                  <iframe src={opened.url} title="Record" className="h-[55vh] w-full rounded-xl" />
                ) : (
                  <TextPreview blob={opened.blob} />
                )
              ) : (
                <p className="p-8 text-center text-sm text-slate-500">
                  Decrypted successfully. Use Download to open this file type.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TextPreview({ blob }) {
  const [text, setText] = useState("Loading...");
  useEffect(() => {
    blob.text().then((t) => setText(t.slice(0, 20000)));
  }, [blob]);
  return (
    <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap p-4 text-xs text-slate-700">
      {text}
    </pre>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}
