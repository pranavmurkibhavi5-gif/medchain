/**
 * Doctor: find a patient and request access.
 *
 * The request itself is an on-chain transaction, so the patient sees exactly
 * who asked and why, and the request is part of the permanent audit trail.
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { Spinner, Modal } from "../../components/ui";
import QrScanner from "../../components/QrScanner";
import { addressFromQr } from "../../components/MyQrCode";

export default function FindPatient() {
  const { address, contract, ensureOnChainIdentity, notify } = useApp();
  const t = useT();

  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [access, setAccess] = useState({});
  const [pendingTo, setPendingTo] = useState({});
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  const search = useCallback(
    async (term = "") => {
      setLoading(true);
      try {
        const { patients } = await api.patients(term);
        setPatients(patients);

        const c = await contract();
        const [reqs, ...states] = await Promise.all([
          c.getDoctorRequests(address),
          ...patients.map((p) =>
            c.hasAccess(p.walletAddress, address, 0n).catch(() => false)
          ),
        ]);
        setAccess(
          Object.fromEntries(patients.map((p, i) => [p.walletAddress.toLowerCase(), states[i]]))
        );
        const waiting = {};
        for (const r of reqs) {
          if (Number(r.status) === 1) waiting[r.patient.toLowerCase()] = true;
        }
        setPendingTo(waiting);
      } catch {
        notify(t("errors.generic"), "error");
      } finally {
        setLoading(false);
      }
    },
    [address, contract, notify, t]
  );

  useEffect(() => {
    search("");
  }, [search]);

  const send = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await ensureOnChainIdentity();
      const c = await contract();
      const tx = await c.requestAccess(target.walletAddress, 0n, reason.trim());
      const receipt = await tx.wait();
      api.logAudit({
        action: "ACCESS_REQUESTED",
        target: target.walletAddress,
        txHash: receipt.hash,
        detail: `Requested access: ${reason.trim()}`,
      }).catch(() => {});
      setSent(true);
      await search(query);
    } catch {
      notify(t("errors.generic"), "error");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setTarget(null);
    setReason("");
    setSent(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("doctor.findPatient")}</h1>
        <p className="text-slate-500">{t("doctor.findPatientHint")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
        className="flex gap-2"
      >
        <input
          className="input-lg flex-1"
          placeholder={t("doctor.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          onClick={() => { setScanError(""); setScanning(true); }}
          aria-label={t("qr.scanTitle")}
          className="btn-ghost border border-slate-200 px-4 text-xl"
        >
          🔳
        </button>
        <button type="submit" className="btn-primary px-5">
          🔍
        </button>
      </form>

      {scanError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {scanError}
        </p>
      )}

      <QrScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onResult={(text) => {
          setScanning(false);
          const addr = addressFromQr(text);
          if (!addr) {
            setScanError(t("qr.notMedChain"));
            return;
          }
          // Search by address: the patient list is filtered server-side, so
          // this lands on exactly the person whose code was scanned.
          setQuery(addr);
          search(addr);
        }}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">🔍</div>
          <p className="mt-3 font-semibold text-slate-800">{t("doctor.noPatients")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {patients.map((p) => {
            const key = p.walletAddress?.toLowerCase();
            const granted = access[key];
            const waiting = pendingTo[key];
            return (
              <li key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xl">
                    🧑
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    {p.bloodGroup && <p className="text-sm text-slate-500">{p.bloodGroup}</p>}
                  </div>
                </div>
                {granted ? (
                  <span className="badge-green mt-3 inline-flex">{t("doctor.accessGranted")}</span>
                ) : waiting ? (
                  <span className="badge-amber mt-3 inline-flex">{t("doctor.waitingApproval")}</span>
                ) : (
                  <button onClick={() => setTarget(p)} className="btn-primary mt-3 w-full py-3">
                    {t("doctor.requestAccess")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(target)}
        onClose={close}
        title={sent ? t("doctor.requestSent") : `${t("doctor.requestAccess")} — ${target?.name || ""}`}
        footer={
          sent ? (
            <button onClick={close} className="btn-primary">
              {t("common.done")}
            </button>
          ) : (
            <>
              <button onClick={close} className="btn-ghost">
                {t("common.cancel")}
              </button>
              <button onClick={send} disabled={busy || !reason.trim()} className="btn-primary">
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {busy ? t("doctor.requesting") : t("doctor.requestAccess")}
              </button>
            </>
          )
        }
      >
        {sent ? (
          <div className="py-4 text-center">
            <div className="text-5xl">📨</div>
            <p className="mt-4 font-semibold text-slate-900">{t("doctor.waitingApproval")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="label">{t("doctor.reasonLabel")}</label>
            <textarea
              className="input-lg min-h-[110px]"
              placeholder={t("doctor.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-sm text-slate-500">{t("doctor.reasonHint")}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
