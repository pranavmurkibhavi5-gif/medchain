/**
 * Doctors with access (patient).
 *
 * Revoking closes both gates: the on-chain permission is withdrawn and every
 * key envelope sealed for that doctor is deleted, so a cached reference is
 * useless to them.
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { Spinner, Modal } from "../../components/ui";

export default function Doctors() {
  const { address, contract, notify } = useApp();
  const t = useT();

  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await contract();
      const [wallets, active] = await c.getGrantedDoctors(address);
      const list = wallets.map((w, i) => ({ address: w, active: active[i] }));
      setRows(list);

      const map = {};
      await Promise.all(
        list.map(async (r) => {
          try {
            const { user } = await api.userByWallet(r.address);
            map[r.address.toLowerCase()] = user;
          } catch {
            map[r.address.toLowerCase()] = { name: t("requests.doctor") };
          }
        })
      );
      setProfiles(map);
    } catch {
      notify(t("errors.generic"), "error");
    } finally {
      setLoading(false);
    }
  }, [address, contract, notify, t]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (doctorAddress) => {
    setBusy(doctorAddress);
    setConfirm(null);
    try {
      const c = await contract();
      const tx = await c.revokeAccess(doctorAddress, 0n);
      const receipt = await tx.wait();
      await api.revokeKeys({ doctorAddress });
      api.logAudit({
        action: "ACCESS_REVOKED",
        target: doctorAddress,
        txHash: receipt.hash,
        detail: "Access revoked and shared keys destroyed",
      }).catch(() => {});
      notify(t("permissions.revoked"), "success");
      await load();
    } catch {
      notify(t("errors.generic"), "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  const active = rows.filter((r) => r.active);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">{t("permissions.title")}</h1>

      {active.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">🔒</div>
          <p className="mt-3 font-semibold text-slate-800">{t("permissions.none")}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{t("permissions.noneHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((r) => {
            const p = profiles[r.address.toLowerCase()] || {};
            return (
              <li key={r.address} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                    👨‍⚕️
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{p.name || t("requests.doctor")}</p>
                    <p className="text-sm text-slate-500">
                      {p.specialization || "—"}
                      {p.hospital ? ` · ${p.hospital}` : ""}
                    </p>
                    <span className="badge-green mt-1 inline-flex">{t("permissions.active")}</span>
                  </div>
                </div>
                <button
                  onClick={() => setConfirm({ address: r.address, name: p.name })}
                  disabled={busy === r.address}
                  className="btn-danger mt-3 w-full py-3"
                >
                  {busy === r.address ? <Spinner className="h-4 w-4" /> : null}
                  {busy === r.address ? t("permissions.revoking") : t("permissions.revoke")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={t("permissions.revokeConfirm", { name: confirm?.name || t("requests.doctor") })}
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button onClick={() => revoke(confirm.address)} className="btn-danger">
              {t("permissions.revoke")}
            </button>
          </>
        }
      >
        <p className="text-slate-600">{t("permissions.revokeConfirmHint")}</p>
      </Modal>
    </div>
  );
}
