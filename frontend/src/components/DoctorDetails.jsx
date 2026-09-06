/**
 * A doctor's own professional details, on the Profile screen.
 *
 * These are what a patient sees in the directory before choosing who to trust
 * with their records, so they are stored in the clear on purpose - unlike a
 * patient's health details, which are encrypted. They are also self-declared:
 * the verified badge comes from an administrator checking the licence, not
 * from anything typed here.
 */
import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { SPECIALIZATIONS, expertiseList } from "../lib/doctors";

const FIELDS = [
  { key: "qualification", label: "doctor.qualification", placeholder: "MBBS, MD (General Medicine)" },
  { key: "experienceYears", label: "doctor.experience", type: "number", min: 0, max: 70 },
  { key: "hospital", label: "doctor.hospital", placeholder: "KLE Hospital" },
  { key: "location", label: "doctor.location", placeholder: "Belagavi, Karnataka" },
  { key: "availability", label: "doctor.availability", placeholder: "Mon-Fri, 10am - 5pm" },
  { key: "about", label: "doctor.about", long: true },
  { key: "expertise", label: "doctor.expertise", long: true, placeholder: "Hypertension, Diabetes, ECG" },
];

export default function DoctorDetails() {
  const { user, notify, refreshUser } = useApp();
  const t = useT();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      specialization: user.specialization || "",
      qualification: user.qualification || "",
      experienceYears: user.experienceYears || "",
      hospital: user.hospital || "",
      location: user.location || "",
      availability: user.availability || "",
      about: user.about || "",
      expertise: expertiseList(user.expertise).join(", "),
    });
  }, [user]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProfile({
        ...form,
        experienceYears: Number(form.experienceYears || 0),
        // Stored as a list, entered as a comma-separated line.
        expertise: expertiseList(form.expertise),
      });
      await refreshUser();
      setDirty(false);
      notify(t("doctor.detailsSaved"), "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-left">
          <span className="block font-semibold text-slate-900">🩺 {t("doctor.myDetails")}</span>
          <span className="block text-xs text-slate-500">{t("doctor.myDetailsHint")}</span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {t("doctor.specialization")}
            </span>
            <select
              className="input-lg"
              value={form.specialization || ""}
              onChange={set("specialization")}
            >
              <option value="">{t("doctor.pickSpecialization")}</option>
              {SPECIALIZATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {/* Keep an existing value that is not in the list. */}
              {form.specialization && !SPECIALIZATIONS.includes(form.specialization) && (
                <option value={form.specialization}>{form.specialization}</option>
              )}
            </select>
          </label>

          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t(f.label)}</span>
              {f.long ? (
                <textarea
                  rows={3}
                  className="input-lg"
                  placeholder={f.placeholder}
                  value={form[f.key] || ""}
                  onChange={set(f.key)}
                />
              ) : (
                <input
                  type={f.type || "text"}
                  min={f.min}
                  max={f.max}
                  className="input-lg"
                  placeholder={f.placeholder}
                  value={form[f.key] || ""}
                  onChange={set(f.key)}
                />
              )}
            </label>
          ))}

          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {t("doctor.detailsPublicNote")}
          </p>

          <button
            onClick={save}
            disabled={saving || !dirty}
            className="btn-primary w-full disabled:opacity-50"
          >
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </div>
      )}
    </section>
  );
}
