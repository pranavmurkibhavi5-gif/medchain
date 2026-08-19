/**
 * The medical record security flow, exactly as specified:
 *
 *   select -> validate -> encrypt -> upload to IPFS -> receive CID ->
 *   generate hash -> store hash + CID + metadata on-chain -> confirm -> done
 *
 * The plaintext file never leaves this component: it is encrypted in memory and
 * only the ciphertext is handed to the API.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { RequireWallet } from "../../components/Guards";
import { PageHeader, Alert, Spinner, StepList, TxLink } from "../../components/ui";
import { encryptFile, sealKey, validateFile, formatBytes } from "../../lib/crypto";
import { RECORD_TYPES } from "../../lib/records";
import { api } from "../../lib/api";
import { waitForTx, readEventArg, humanError } from "../../lib/web3";

const STEPS = [
  "Validate the selected file",
  "Encrypt with AES-256-GCM in your browser",
  "Upload the encrypted file to IPFS",
  "Generate the keccak256 integrity hash",
  "Store hash + CID on the blockchain (MetaMask)",
  "Wait for transaction confirmation",
  "Record the confirmed metadata",
];

export default function UploadRecord() {
  return (
    <RequireWallet>
      <UploadInner />
    </RequireWallet>
  );
}

function UploadInner() {
  const { keyPair, contract, notify } = useApp();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [recordType, setRecordType] = useState("Lab Report");
  const [notes, setNotes] = useState("");

  const [step, setStep] = useState(-1);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState({});

  const pick = (f) => {
    setError("");
    setResult(null);
    if (!f) return setFile(null);
    const check = validateFile(f);
    if (!check.ok) {
      setFile(null);
      return setError(check.error);
    }
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    pick(e.dataTransfer.files?.[0]);
  };

  const reset = () => {
    setFile(null);
    setNotes("");
    setStep(-1);
    setError("");
    setResult(null);
    setDetail({});
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);

    try {
      // ---- 1. validate -------------------------------------------------
      setStep(0);
      const check = validateFile(file);
      if (!check.ok) throw new Error(check.error);

      // ---- 2. encrypt --------------------------------------------------
      setStep(1);
      const { envelope, dataKey, hash } = await encryptFile(file);
      setDetail((d) => ({ ...d, encryptedSize: envelope.length, hash }));

      // ---- 3. upload ciphertext to IPFS --------------------------------
      setStep(2);
      const uploaded = await api.uploadEncrypted(envelope, `${file.name}.enc`);
      setDetail((d) => ({ ...d, cid: uploaded.cid, provider: uploaded.provider }));

      // ---- 4. hash (computed locally, cross-checked with the server) ---
      setStep(3);
      if (uploaded.dataHash.toLowerCase() !== hash.toLowerCase()) {
        throw new Error(
          "Hash mismatch between your browser and the server - upload aborted for safety"
        );
      }

      // ---- 5. commit to the blockchain ---------------------------------
      setStep(4);
      const c = await contract();
      const tx = await c.uploadRecord(
        hash,
        uploaded.cid,
        file.name,
        file.type || "application/octet-stream",
        BigInt(file.size),
        recordType
      );
      setDetail((d) => ({ ...d, txHash: tx.hash }));

      // ---- 6. wait for the receipt -------------------------------------
      setStep(5);
      const receipt = await waitForTx(tx);
      if (receipt.status !== "success") throw new Error("The blockchain transaction failed");

      const recordId = readEventArg(receipt.receipt, c, "RecordUploaded", "recordId");
      if (!recordId) throw new Error("Could not read the new record id from the transaction");

      // ---- 7. persist metadata + seal the key to yourself --------------
      setStep(6);
      const ownerEnvelope = await sealKey(dataKey, keyPair.publicKey);
      await api.confirmRecord({
        recordId,
        cid: uploaded.cid,
        dataHash: hash,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        recordType,
        notes,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        ownerEnvelope,
      });

      await api
        .logAudit({
          action: "CHAIN_REGISTERED",
          recordId,
          txHash: receipt.hash,
          detail: `${recordType} "${file.name}" anchored on-chain`,
        })
        .catch(() => {});

      setStep(STEPS.length);
      setResult({
        recordId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        cid: uploaded.cid,
        dataHash: hash,
        provider: uploaded.provider,
      });
      notify(`Record #${recordId} secured on the blockchain`, "success");
    } catch (err) {
      console.error(err);
      setError(humanError(err));
    }
  };

  const running = step >= 0 && step < STEPS.length && !error;

  // ------------------------------------------------------------------ done
  if (result) {
    return (
      <div>
        <PageHeader title="Record secured" subtitle="Your medical record is now anchored on-chain." />
        <div className="card card-pad">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
              &#10003;
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-slate-900">
                Record #{result.recordId} uploaded successfully
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                The encrypted file is on IPFS. Only its hash and reference went on-chain.
              </p>

              <dl className="mt-5 space-y-3 text-sm">
                <Row label="On-chain record ID">#{result.recordId}</Row>
                <Row label="IPFS CID">
                  <code className="mono break-all">{result.cid}</code>
                  <span className="badge-slate ml-2">{result.provider}</span>
                </Row>
                <Row label="Integrity hash (keccak256)">
                  <code className="mono break-all">{result.dataHash}</code>
                </Row>
                <Row label="Transaction">
                  <code className="mono break-all text-slate-600">{result.txHash}</code>
                  <div className="mt-1.5">
                    <TxLink hash={result.txHash} />
                  </div>
                </Row>
                <Row label="Block / gas used">
                  #{result.blockNumber} &middot; {Number(result.gasUsed).toLocaleString()} gas
                </Row>
              </dl>

              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => navigate("/patient/records")} className="btn-primary">
                  View my records
                </button>
                <button onClick={reset} className="btn-ghost">
                  Upload another
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ form
  return (
    <div>
      <PageHeader
        title="Upload a medical record"
        subtitle="Encrypted in your browser. Only the hash and IPFS reference are written to the blockchain."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <form onSubmit={submit} className="space-y-5 lg:col-span-2">
          <div className="card card-pad">
            <label className="label">Medical file</label>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
            >
              {file ? (
                <div>
                  <div className="text-3xl">&#128196;</div>
                  <p className="mt-2 font-semibold text-slate-900">{file.name}</p>
                  <p className="text-sm text-slate-500">
                    {formatBytes(file.size)} &middot; {file.type || "unknown type"}
                  </p>
                  <button
                    type="button"
                    onClick={() => pick(null)}
                    className="btn-ghost btn-sm mt-3"
                    disabled={running}
                  >
                    Choose a different file
                  </button>
                </div>
              ) : (
                <div>
                  <div className="text-3xl">&#11014;</div>
                  <p className="mt-2 text-sm text-slate-600">
                    Drag a file here, or{" "}
                    <label className="link cursor-pointer font-semibold">
                      browse
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => pick(e.target.files?.[0])}
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.doc,.docx"
                      />
                    </label>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    PDF, images, text or documents &middot; up to 15 MB
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Record type</label>
                <select
                  className="input"
                  value={recordType}
                  onChange={(e) => setRecordType(e.target.value)}
                  disabled={running}
                >
                  {RECORD_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  Note <span className="font-normal text-slate-400">(optional, stored off-chain)</span>
                </label>
                <input
                  className="input"
                  placeholder="Annual check-up, Jan 2026"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={running}
                />
              </div>
            </div>
          </div>

          {error && (
            <Alert kind="error" title="Upload stopped" onClose={() => setError("")}>
              <span className="whitespace-pre-wrap">{error}</span>
            </Alert>
          )}

          <button type="submit" disabled={!file || running} className="btn-primary w-full py-3">
            {running ? <Spinner /> : null}
            {running ? "Securing your record..." : "Encrypt and store on blockchain"}
          </button>

          <p className="text-center text-xs text-slate-400">
            MetaMask will ask you to confirm one transaction. Gas is paid in test ETH.
          </p>
        </form>

        {/* Live pipeline */}
        <div className="space-y-5">
          <div className="card card-pad">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Security pipeline
            </h3>
            <div className="mt-4">
              <StepList steps={STEPS} current={step < 0 ? -1 : step} error={Boolean(error)} />
            </div>

            {(detail.hash || detail.cid) && (
              <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-xs">
                {detail.encryptedSize && (
                  <Detail label="Encrypted size">{formatBytes(detail.encryptedSize)}</Detail>
                )}
                {detail.cid && (
                  <Detail label="IPFS CID">
                    <code className="mono break-all">{detail.cid}</code>
                  </Detail>
                )}
                {detail.hash && (
                  <Detail label="keccak256">
                    <code className="mono break-all">{detail.hash.slice(0, 26)}...</code>
                  </Detail>
                )}
                {detail.txHash && (
                  <Detail label="Transaction">
                    <TxLink hash={detail.txHash} label="On explorer" />
                  </Detail>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            <p className="font-bold">Never stored on the blockchain</p>
            <p className="mt-1">
              The medical file itself. Only its keccak256 hash, IPFS CID, file name, type, size and
              record type are written on-chain - enough to prove integrity, never enough to read the
              content.
            </p>
            <p className="mt-2 font-bold">Use dummy files</p>
            <p className="mt-1">
              This is an academic deployment on a public testnet. Upload sample data only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[190px_1fr]">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-800">{children}</dd>
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 font-medium text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-slate-700">{children}</span>
    </div>
  );
}
