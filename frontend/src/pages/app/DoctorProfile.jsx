/**
 * A doctor's full profile, as a patient sees it.
 *
 * Grant Access here is the real thing: it calls grantAccess on the smart
 * contract and then re-seals every record key for that doctor, reusing the
 * same sharing code the approve-a-request flow uses. Nothing about it is
 * decorative - if the transaction fails, no keys are shared and the screen
 * says so.
 *
 * Revoking uses the existing revoke path, so access granted here can be taken
 * back from the Doctors screen like any other.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { shareAllRecordKeys } from "../../lib/records";
import { shareProfileWith } from "../../lib/profile-store";
import { experienceLabel, expertiseList, iconFor } from "../../lib/doctors";
import { Spinner, Modal } from "../../components/ui";
import Avatar from "../../components/Avatar";

export default function DoctorProfile() {
  const { address: wallet } = useParams();
  const { address, keyPair, contract, notify } = useApp();
  const t = useT();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { user } = await api.userByWallet(wallet);
      setDoctor(user);
      try {
        const c = await contract();
        setGranted(await c.hasAccess(address, wallet, 0n));
      } catch {
        setGranted(false);
      }
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [wallet, address, contract, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const grant = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      if (!doctor?.encryptionPublicKey) throw new Error(t("doctor.noKey"));

      setProgress(t("doctor.granting"));
      const c = await contract();
      // 0 means every record, matching how revoke already works.
      const tx = await c.grantAccess(wallet, 0n);
      const receipt = await tx.wait();

      setProgress(t("doctor.sharingKeys"));
      const { records } = await api.myRecords();
      const { shared } = await shareAllRecordKeys(
        records,
        doctor.walletAddress,
        doctor.encryptionPublicKey,
        keyPair
      );

      // Best effort: a missing health profile is normal and must not undo a
      // grant already recorded on-chain.
      try {
        await shareProfileWith(keyPair, address, doctor.walletAddress);
      } catch (err) {
        console.warn("[profile] not shared:", err.message);
      }

      api
        .logAudit({
          action: "ACCESS_GRANTED",
          target: doctor.walletAddress,
          recordId: 0,
          txHash: receipt.hash,
          detail: `Access granted directly from the doctor profile; ${shared} key(s) shared`,
        })
        .catch(() => {});

      setGranted(true);
      notify(t("doctor.granted"), "success");
    } catch (err) {
      notify(err.message || t("errors.generic"), "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
        <p className="font-semibold text-slate-800">{t("doctor.notFound")}</p>
        <Link to="/app/find-doctors" className="btn-primary mt-5 inline-flex px-5 py-3">
          {t("doctor.backToList")}
        </Link>
      </div>
    );
  }

  const expertise = expertiseList(doctor.expertise);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-4">
          <Avatar wallet={doctor.walletAddress} name={doctor.name} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-extrabold text-slate-900">{doctor.name}</h1>
              {doctor.verified ? (
                <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                  ✔️ {t("doctor.verified")}
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {t("doctor.unverified")}
                </span>
              )}
            </div>

            {doctor.qualification && (
              <p className="mt-0.5 text-sm text-slate-600">{doctor.qualification}</p>
            )}
            {doctor.specialization && (
              <p className="mt-0.5 text-sm font-semibold text-brand-700">
                {iconFor(doctor.specialization)} {doctor.specialization}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row k={t("doctor.experience")} v={experienceLabel(doctor.experienceYears, t)} />
          <Row k={t("doctor.hospital")} v={doctor.hospital} />
          <Row k={t("doctor.location")} v={doctor.location} />
          <Row k={t("doctor.availability")} v={doctor.availability} />
          <Row k={t("doctor.licence")} v={doctor.licenseId} />
        </dl>
      </section>

      {doctor.about && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">{t("doctor.about")}</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {doctor.about}
          </p>
        </section>
      )}

      {expertise.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">{t("doctor.expertise")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {expertise.map((e) => (
              <span
                key={e}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
              >
                {e}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        {granted ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">✓ {t("doctor.hasAccess")}</p>
            <p className="mt-1 text-sm text-emerald-800">{t("doctor.hasAccessHint")}</p>
            <Link to="/app/doctors" className="btn-ghost btn-sm mt-3 inline-flex">
              {t("doctor.manageAccess")}
            </Link>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            disabled={busy}
            className="btn-primary w-full py-4 text-base disabled:opacity-50"
          >
            {busy ? progress || t("doctor.granting") : `🔓 ${t("doctor.grantAccess")}`}
          </button>
        )}

        <button
          onClick={() => navigate("/app/appointments")}
          className="btn-ghost w-full border border-slate-200 py-4 text-base"
        >
          📅 {t("doctor.bookAppointment")}
        </button>
      </section>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("doctor.grantConfirm", { name: doctor.name })}
        footer={
          <>
            <button onClick={() => setConfirm(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button onClick={grant} className="btn-primary">
              {t("doctor.grantAccess")}
            </button>
          </>
        }
      >
        <p className="text-slate-600">{t("doctor.grantConfirmHint")}</p>
      </Modal>
    </div>
  );
}

function Row({ k, v }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v}</dd>
    </div>
  );
}
