/**
 * Appointments, for both roles.
 *
 * A patient books a slot with a doctor and can cancel it. A doctor sees what
 * has been requested and confirms, declines or marks it done.
 *
 * The reason for the visit is encrypted before it leaves the device and sealed
 * to the two people involved, so it is readable here and nowhere else. Booking
 * grants no access to records - the screen says so, because a patient should
 * not have to infer it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { Spinner, Modal, formatDate } from "../../components/ui";
import { OPEN_STATUSES, STATUS_TONE, nextHour, toLocalInput } from "../../lib/appointments";
import { bookAppointment, listAppointments, setStatus } from "../../lib/appointments-store";

export default function Appointments() {
  const { user, address, keyPair, notify } = useApp();
  const t = useT();
  const isDoctor = user?.role === "doctor";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Booking form (patients only)
  const [booking, setBooking] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [pickedDoctor, setPickedDoctor] = useState("");
  const [when, setWhen] = useState(toLocalInput(nextHour()));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!keyPair) return;
    setLoading(true);
    try {
      setItems(await listAppointments(keyPair));
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [keyPair, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const openBooking = async () => {
    setBooking(true);
    try {
      const { doctors } = await api.doctors("");
      setDoctors(doctors.filter((d) => d.walletAddress && d.encryptionPublicKey));
    } catch {
      notify(t("errors.generic"), "error");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const doc = doctors.find((d) => d.walletAddress === pickedDoctor);
    if (!doc) return;

    setSaving(true);
    try {
      await bookAppointment({
        doctor: { address: doc.walletAddress, publicKey: doc.encryptionPublicKey },
        whenLocal: when,
        reason,
        keyPair,
        myAddress: address,
      });
      setBooking(false);
      setReason("");
      setPickedDoctor("");
      notify(t("appointments.booked"), "success");
      await load();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const change = async (appt, status) => {
    setBusyId(appt.id);
    try {
      await setStatus(appt.id, status);
      notify(t(`appointments.now_${status}`), "success");
      await load();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const { upcoming, past } = useMemo(() => {
    const open = [];
    const done = [];
    for (const a of items) (OPEN_STATUSES.includes(a.status) ? open : done).push(a);
    return { upcoming: open, past: done };
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("appointments.title")}</h1>
          <p className="text-slate-500">
            {isDoctor ? t("appointments.doctorHint") : t("appointments.patientHint")}
          </p>
        </div>
        {!isDoctor && (
          <button onClick={openBooking} className="btn-primary btn-sm shrink-0">
            ＋
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">📅</div>
          <p className="mt-3 font-semibold text-slate-800">{t("appointments.empty")}</p>
          {!isDoctor && (
            <button onClick={openBooking} className="btn-primary mt-5 px-5 py-3">
              {t("appointments.book")}
            </button>
          )}
        </div>
      ) : (
        <>
          <Group
            title={t("appointments.upcoming")}
            list={upcoming}
            isDoctor={isDoctor}
            busyId={busyId}
            onChange={change}
            t={t}
          />
          <Group
            title={t("appointments.past")}
            list={past}
            isDoctor={isDoctor}
            busyId={busyId}
            onChange={change}
            t={t}
            muted
          />
        </>
      )}

      {/* Booking */}
      <Modal
        open={booking}
        onClose={() => setBooking(false)}
        title={t("appointments.book")}
        footer={
          <>
            <button onClick={() => setBooking(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button
              form="book-form"
              type="submit"
              disabled={saving || !pickedDoctor}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? t("appointments.booking") : t("appointments.confirmBooking")}
            </button>
          </>
        }
      >
        <form id="book-form" onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("appointments.doctor")}
            </span>
            <select
              className="input-lg"
              value={pickedDoctor}
              onChange={(e) => setPickedDoctor(e.target.value)}
              required
            >
              <option value="">{t("appointments.pickDoctor")}</option>
              {doctors.map((d) => (
                <option key={d.walletAddress} value={d.walletAddress}>
                  {d.name}
                  {d.specialization ? ` · ${d.specialization}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("appointments.when")}
            </span>
            <input
              type="datetime-local"
              className="input-lg"
              value={when}
              min={toLocalInput(nextHour())}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("appointments.reason")}{" "}
              <span className="font-normal text-slate-400">({t("common.optional")})</span>
            </span>
            <textarea
              rows={3}
              className="input-lg"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("appointments.reasonPlaceholder")}
            />
          </label>

          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            🔒 {t("appointments.reasonEncrypted")}
          </p>
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {t("appointments.noAccessNote")}
          </p>
        </form>
      </Modal>
    </div>
  );
}

function Group({ title, list, isDoctor, busyId, onChange, t, muted = false }) {
  if (list.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">{title}</h2>
      <ul className="space-y-3">
        {list.map((a) => (
          <li
            key={a.id}
            className={`rounded-2xl border border-slate-200 bg-white p-4 ${muted ? "opacity-70" : ""}`}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl">
                📅
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {isDoctor ? a.patientName || t("appointments.patient") : a.doctorName || t("appointments.doctor")}
                </p>
                <p className="text-sm text-slate-500">{formatDate(a.scheduledFor)}</p>

                <span
                  className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    STATUS_TONE[a.status] || STATUS_TONE.cancelled
                  }`}
                >
                  {t(`appointments.status_${a.status}`)}
                </span>

                {a.reason && (
                  <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                    {a.reason}
                  </p>
                )}
                {a.reply && (
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-semibold">{t("appointments.reply")}: </span>
                    {a.reply}
                  </p>
                )}
              </div>
            </div>

            {OPEN_STATUSES.includes(a.status) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {isDoctor && a.status === "requested" && (
                  <>
                    <button
                      onClick={() => onChange(a, "confirmed")}
                      disabled={busyId === a.id}
                      className="btn-success btn-sm"
                    >
                      {t("appointments.confirm")}
                    </button>
                    <button
                      onClick={() => onChange(a, "declined")}
                      disabled={busyId === a.id}
                      className="btn-ghost btn-sm"
                    >
                      {t("appointments.decline")}
                    </button>
                  </>
                )}
                {isDoctor && a.status === "confirmed" && (
                  <button
                    onClick={() => onChange(a, "completed")}
                    disabled={busyId === a.id}
                    className="btn-ghost btn-sm"
                  >
                    {t("appointments.markDone")}
                  </button>
                )}
                {!isDoctor && (
                  <button
                    onClick={() => onChange(a, "cancelled")}
                    disabled={busyId === a.id}
                    className="btn-ghost btn-sm text-rose-600"
                  >
                    {t("appointments.cancel")}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
