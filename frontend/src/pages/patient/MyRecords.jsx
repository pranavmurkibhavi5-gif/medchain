import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import {
  PageHeader, Alert, Spinner, EmptyState, Modal, TxLink, Address, formatDate,
} from "../../components/ui";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/crypto";
import { openRecord, downloadBlob, isPreviewable } from "../../lib/records";

export default function MyRecords() {
  return (
    <RequireWallet>
      <RecordsInner />
    </RequireWallet>
  );
}

function RecordsInner() {
  const { keyPair, notify } = useApp();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null); // record being viewed
  const [opened, setOpened] = useState(null); // { blob, meta, url }
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { records } = await api.myRecords();
      setRecords(records);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Release the object URL when the preview closes.
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
      const { blob, meta } = await openRecord(record, keyPair);
      setOpened({ blob, meta, url: URL.createObjectURL(blob) });
      api.logAudit({
        action: "RECORD_DECRYPTED",
        recordId: record.recordId,
        detail: `Opened "${record.fileName}"`,
      }).catch(() => {});
    } catch (err) {
      notify(err.message, "error");
      setActive(null);
    } finally {
      setBusyId(null);
    }
  };

  const download = async (record) => {
    setBusyId(record.recordId);
    try {
      const { blob, meta } = await openRecord(record, keyPair);
      downloadBlob(blob, meta.name || record.fileName);
      notify("Decrypted and downloaded", "success");
    } catch (err) {
      notify(err.message, "error");
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
      <PageHeader title="My medical records" subtitle={`${records.length} record${records.length === 1 ? "" : "s"} secured on the blockchain`}>
        <Link to="/patient/upload" className="btn-primary btn-sm">
          + Upload record
        </Link>
      </PageHeader>

      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

      {records.length === 0 ? (
        <EmptyState
          icon="&#128193;"
          title="No records yet"
          action={
            <Link to="/patient/upload" className="btn-primary">
              Upload your first record
            </Link>
          }
        >
          Upload a medical file - it gets encrypted in your browser and anchored on-chain.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((r) => (
            <div key={r.recordId} className="card card-pad flex flex-col animate-fade-up">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900" title={r.fileName}>
                    {r.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.recordType} &middot; {formatBytes(r.fileSize)}
                  </p>
                </div>
                <span className="badge-blue shrink-0">#{r.recordId}</span>
              </div>

              {r.notes && <p className="mt-2 text-xs italic text-slate-500">"{r.notes}"</p>}

              <dl className="mt-3 space-y-1.5 text-[11px] text-slate-500">
                <div className="flex justify-between gap-2">
                  <dt>Uploaded</dt>
                  <dd className="text-slate-700">{formatDate(r.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Shared with</dt>
                  <dd className="text-slate-700">
                    {Math.max(0, (r.sharedWith?.length || 1) - 1)} doctor(s)
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <dt className="shrink-0">Hash</dt>
                  <dd className="mono truncate text-slate-700" title={r.dataHash}>
                    {r.dataHash?.slice(0, 14)}...
                  </dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <button
                  onClick={() => view(r)}
                  disabled={busyId === r.recordId}
                  className="btn-primary btn-sm"
                >
                  {busyId === r.recordId ? <Spinner className="h-3 w-3" /> : null} View
                </button>
                <button
                  onClick={() => download(r)}
                  disabled={busyId === r.recordId}
                  className="btn-ghost btn-sm"
                >
                  Download
                </button>
                {r.txHash && <TxLink hash={r.txHash} label="Tx" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewer */}
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
            <p className="mt-3 text-sm text-slate-500">Verifying hash and decrypting...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert kind="success" title="Integrity verified">
              The downloaded file hashes to exactly the value recorded on the blockchain, so it has
              not been altered since you uploaded it.
            </Alert>

            <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2">
              <Field label="Record ID">#{active.recordId}</Field>
              <Field label="Type">{active.recordType}</Field>
              <Field label="Original size">{formatBytes(opened.meta.size || active.fileSize)}</Field>
              <Field label="Encrypted at">{formatDate(opened.meta.encryptedAt)}</Field>
              <Field label="IPFS CID" full>
                <code className="mono break-all">{active.cid}</code>
              </Field>
              <Field label="On-chain hash" full>
                <code className="mono break-all">{active.dataHash}</code>
              </Field>
              <Field label="Owner" full>
                <Address value={active.owner} />
              </Field>
            </dl>

            <div className="rounded-xl border border-slate-200 bg-white">
              {isPreviewable(opened.meta.type) ? (
                opened.meta.type.startsWith("image/") ? (
                  <img src={opened.url} alt={active.fileName} className="mx-auto max-h-[45vh] rounded-xl" />
                ) : opened.meta.type === "application/pdf" ? (
                  <iframe src={opened.url} title="Record preview" className="h-[55vh] w-full rounded-xl" />
                ) : (
                  <TextPreview blob={opened.blob} />
                )
              ) : (
                <p className="p-8 text-center text-sm text-slate-500">
                  Decrypted successfully. This file type cannot be previewed - use Download.
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
