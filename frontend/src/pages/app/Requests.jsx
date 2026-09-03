/**
 * Access requests (patient).
 *
 * Approving does two things that must both succeed: record the permission
 * on-chain, and re-seal each record key to that doctor so they can actually
 * decrypt. The patient sees one button and one confirmation.
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { shareAllRecordKeys, REQUEST_STATUS } from "../../lib/records";
import { Spinner, Modal, formatDate } from "../../components/ui";

export default function Requests({ onCounts }) {
  const { address, keyPair, contract, notify } = useApp();
  const t = useT();

  const [requests, setRequests] = useState([]);
  const [doctors, setDoctors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [progress, setProgress] = useState("");
  const [confirm, setConfirm] = useState(null); // { req, action }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await contract();
      const raw = await c.getPatientRequests(address);
      const list = raw
        .map((r) => ({
          id: Number(r.id),
          recordId: Number(r.recordId),
          doctor: r.doctor,
          reason: r.reason,
          status: Number(r.status),
          requestedAt: Number(r.requestedAt),
        }))
        .sort((a, b) => b.requestedAt - a.requestedAt);
      setRequests(list);
      onCounts?.({ pending: list.filter((r) => r.status === 1).length });

      const map = {};
      await Promise.all(
        [...new Set(list.map((r) => r.doctor.toLowerCase()))].map(async (addr) => {
          try {
            const { user } = await api.userByWallet(addr);
            map[addr] = user;
          } catch {
            map[addr] = { name: t("requests.doctor"), walletAddress: addr };
          }
        })
      );
      setDoctors(map);
    } catch (err) {
      notify(t("errors.generic"), "error");
    } finally {
      setLoading(false);
    }
  }, [address, contract, notify, t, onCounts]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (req) => {
    setBusyId(req.id);
    setConfirm(null);
    try {
      const doc = doctors[req.doctor.toLowerCase()];
      if (!doc?.encryptionPublicKey) throw new Error("NO_DOCTOR_KEY");

      setProgress(t("requests.approving"));
      const c = await contract();
      const tx = await c.approveRequest(BigInt(req.id));
      const receipt = await tx.wait();

      const { records } = await api.myRecords();
      const scope = req.recordId === 0 ? records : records.filter((r) => r.recordId === req.recordId);
      const { shared } = await shareAllRecordKeys(
        scope, doc.walletAddress, doc.encryptionPublicKey, keyPair
      );

      api.logAudit({
        action: "ACCESS_GRANTED",
        target: doc.walletAddress,
        recordId: req.recordId,
        txHash: receipt.hash,
        detail: `Approved request #${req.id}; ${shared} key(s) shared`,
      }).catch(() => {});

      notify(t("requests.approved"), "success");
      await load();
    } catch (err) {
      notify(t("errors.generic"), "error");
    } finally {
      setBusyId(null);
      setProgress("");
    }
  };

  const reject = async (req) => {
    setBusyId(req.id);
    setConfirm(null);
    try {
      setProgress(t("requests.rejecting"));
      const c = await contract();
      const tx = await c.rejectRequest(BigInt(req.id));
      const receipt = await tx.wait();
      api.logAudit({
        action: "ACCESS_REJECTED",
        target: req.doctor,
        recordId: req.recordId,
        txHash: receipt.hash,
        detail: `Rejected request #${req.id}`,
      }).catch(() => {});
      notify(t("requests.rejected"), "success");
      await load();
    } catch {
      notify(t("errors.generic"), "error");
    } finally {
      setBusyId(null);
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

  const pending = requests.filter((r) => r.status === 1);
  const past = requests.filter((r) => r.status !== 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">{t("requests.title")}</h1>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("requests.pending")}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-12 text-center">
            <div className="text-4xl">✅</div>
            <p className="mt-3 font-semibold text-slate-800">{t("requests.noPending")}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{t("requests.noPendingHint")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((req) => {
              const doc = doctors[req.doctor.toLowerCase()] || {};
              const busy = busyId === req.id;
              return (
                <li key={req.id} className="rounded-2xl border border-amber-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-xl">
                      👩‍⚕️
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{doc.name || t("requests.doctor")}</p>
                      <p className="text-sm text-slate-500">
                        {doc.specialization || "—"}
                        {doc.hospital ? ` · ${doc.hospital}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {t("requests.requested")} {formatDate(req.requestedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t("requests.reason")}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{req.reason || t("requests.noReason")}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {t("requests.whichRecords")}:{" "}
                    <strong>{req.recordId === 0 ? t("requests.allRecords") : t("requests.oneRecord")}</strong>
                  </p>

                  {busy ? (
                    <div className="mt-4 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-brand-600">
                      <Spinner className="h-4 w-4" /> {progress}
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setConfirm({ req, action: "reject" })}
                        className="btn-ghost py-3 font-semibold text-rose-600"
                      >
                        {t("requests.reject")}
                      </button>
                      <button
                        onClick={() => setConfirm({ req, action: "approve" })}
                        className="btn-success py-3"
                      >
                        {t("requests.approve")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("requests.history")}
          </h2>
          <ul className="space-y-2">
            {past.map((r) => {
              const doc = doctors[r.doctor.toLowerCase()] || {};
              const label = {
                2: t("requests.statusApproved"),
                3: t("requests.statusRejected"),
                4: t("requests.statusRevoked"),
              }[r.status] || REQUEST_STATUS[r.status]?.label;
              const cls = { 2: "badge-green", 3: "badge-red", 4: "badge-slate" }[r.status] || "badge-slate";
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {doc.name || t("requests.doctor")}
                    </span>
                    <span className="block text-xs text-slate-400">{formatDate(r.requestedAt)}</span>
                  </span>
                  <span className={cls}>{label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={
          confirm?.action === "approve"
            ? t("requests.approveConfirm", {
                name: doctors[confirm?.req.doctor.toLowerCase()]?.name || t("requests.doctor"),
              })
            : t("requests.rejectConfirm")
        }
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button
              onClick={() =>
                confirm.action === "approve" ? approve(confirm.req) : reject(confirm.req)
              }
              className={confirm?.action === "approve" ? "btn-success" : "btn-danger"}
            >
              {confirm?.action === "approve" ? t("requests.approve") : t("requests.reject")}
            </button>
          </>
        }
      >
        {confirm?.action === "approve" && (
          <p className="text-slate-600">{t("requests.approveConfirmHint")}</p>
        )}
      </Modal>
    </div>
  );
}
