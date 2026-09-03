/**
 * Upload a medical record.
 *
 * The security pipeline underneath is unchanged - validate, AES-256-GCM in the
 * browser, ciphertext to IPFS, keccak256, commit hash + CID on-chain. What
 * changed is that the patient sees five plain words instead of seven technical
 * ones, and never has to confirm anything in a wallet.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { encryptFile, sealKey, validateFile, formatBytes } from "../../lib/crypto";
import { RECORD_TYPES } from "../../lib/records";
import { Spinner } from "../../components/ui";

const STEPS = ["preparing", "encrypting", "securing", "uploading", "completed"];

export default function Upload() {
  const { keyPair, contract, ensureOnChainIdentity, notify } = useApp();
  const t = useT();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [recordType, setRecordType] = useState(RECORD_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState(-1);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const pick = (f) => {
    setError("");
    setDone(null);
    if (!f) return setFile(null);
    const check = validateFile(f);
    if (!check.ok) {
      setFile(null);
      const map = {
        "Choose a file first": "errors.fileRequired",
        "That file is empty": "errors.fileEmpty",
      };
      const key = Object.entries(map).find(([m]) => check.error.startsWith(m))?.[1];
      setError(
        key ? t(key) : check.error.includes("limit") ? t("errors.fileTooBig") : t("errors.fileType")
      );
      return;
    }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      // 1. preparing - validate, and make sure the account exists on-chain
      setStep(0);
      const check = validateFile(file);
      if (!check.ok) throw new Error(check.error);
      await ensureOnChainIdentity();

      // 2. encrypting - AES-256-GCM, entirely in this browser
      setStep(1);
      const { envelope, dataKey, hash } = await encryptFile(file);

      // 3. securing - ciphertext to IPFS, returns a content identifier
      setStep(2);
      const uploaded = await api.uploadEncrypted(envelope, `${file.name}.enc`);
      if (uploaded.dataHash.toLowerCase() !== hash.toLowerCase()) {
        throw new Error("HASH_MISMATCH");
      }

      // 4. uploading - commit hash + reference on-chain, signed by the user's
      //    own key with no wallet prompt
      setStep(3);
      const c = await contract();
      const tx = await c.uploadRecord(
        hash,
        uploaded.cid,
        file.name,
        file.type || "application/octet-stream",
        BigInt(file.size),
        recordType
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error("TX_FAILED");

      let recordId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = c.interface.parseLog(log);
          if (parsed?.name === "RecordUploaded") {
            recordId = Number(parsed.args.recordId);
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (!recordId) throw new Error("NO_RECORD_ID");

      // 5. completed - store metadata and seal the key to the patient
      setStep(4);
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

      setStep(STEPS.length);
      setDone({ recordId, txHash: receipt.hash });
      notify(t("upload.success"), "success");
    } catch (err) {
      console.error(err);
      const m = String(err.message || "");
      setStep(-1);
      if (m.includes("LOCKED")) setError(t("errors.unlockFailed"));
      else if (m.includes("Cannot reach")) setError(t("errors.network"));
      else if (m.includes("insufficient funds")) setError(t("errors.serverBusy"));
      else setError(t("errors.generic"));
    }
  };

  const running = step >= 0 && step < STEPS.length;

  if (done) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          ✓
        </div>
        <h1 className="mt-5 text-xl font-extrabold text-slate-900">{t("upload.success")}</h1>
        <p className="mt-2 max-w-sm text-slate-500">{t("upload.successSub")}</p>
        <div className="mt-8 w-full max-w-sm space-y-3">
          <button onClick={() => navigate("/app/records")} className="btn-primary w-full py-4 text-base">
            {t("upload.viewRecords")}
          </button>
          <button
            onClick={() => {
              setDone(null);
              setFile(null);
              setNotes("");
              setStep(-1);
            }}
            className="btn-ghost w-full py-4 text-base"
          >
            {t("upload.uploadAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("upload.title")}</h1>
        <p className="text-slate-500">{t("upload.subtitle")}</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <button
          type="button"
          onClick={() => !running && fileInput.current?.click()}
          disabled={running}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-10 text-center transition active:scale-[0.99] disabled:opacity-60"
        >
          {file ? (
            <>
              <div className="text-4xl">📄</div>
              <p className="mt-3 break-all font-semibold text-slate-900">{file.name}</p>
              <p className="text-sm text-slate-500">{formatBytes(file.size)}</p>
              <p className="mt-2 text-sm font-semibold text-brand-600">{t("upload.changeFile")}</p>
            </>
          ) : (
            <>
              <div className="text-4xl">📎</div>
              <p className="mt-3 font-semibold text-slate-900">{t("upload.chooseFile")}</p>
              <p className="mt-1 text-sm text-slate-500">{t("upload.dropHint")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("upload.fileTypes")}</p>
            </>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.doc,.docx"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <div>
          <label className="label">{t("upload.recordType")}</label>
          <select
            className="input-lg"
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            disabled={running}
          >
            {RECORD_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {t(`recordTypes.${rt}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">
            {t("upload.description")}{" "}
            <span className="font-normal text-slate-400">({t("common.optional")})</span>
          </label>
          <input
            className="input-lg"
            placeholder={t("upload.descriptionHint")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={running}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {running && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i < step
                        ? "bg-emerald-100 text-emerald-600"
                        : i === step
                        ? "bg-brand-100 text-brand-600"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {i < step ? "✓" : i + 1}
                  </span>
                  <span
                    className={
                      i === step
                        ? "font-semibold text-slate-900"
                        : i < step
                        ? "text-slate-500"
                        : "text-slate-400"
                    }
                  >
                    {t(`upload.steps.${s}`)}
                  </span>
                  {i === step && <Spinner className="h-4 w-4 text-brand-500" />}
                </li>
              ))}
            </ol>
            {step === 3 && (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {t("upload.confirmInApp")}
              </p>
            )}
          </div>
        )}

        <button type="submit" disabled={!file || running} className="btn-primary w-full py-4 text-base">
          {running ? t("upload.uploading") : t("upload.submit")}
        </button>
      </form>
    </div>
  );
}
