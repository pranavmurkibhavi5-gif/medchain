/**
 * The patient's details, as a treating doctor sees them.
 *
 * Shown above their records once access has been approved. The data arrives
 * encrypted and is decrypted here with the key the patient sealed to this
 * doctor - the server never had a readable copy to hand over.
 *
 * Renders nothing at all when the patient has not filled in a profile, or
 * when this doctor has not been given the key. Absence is normal, not an
 * error, so it is not dressed up as one.
 */
import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { ageFrom, hasContent } from "../lib/profile";
import { loadPatientProfile } from "../lib/profile-store";

const CHIPS = [
  { key: "bloodGroup", label: "profile.bloodGroup", tone: "bg-rose-50 text-rose-700 border-rose-200" },
  { key: "sex", label: "profile.sex", tone: "bg-slate-50 text-slate-700 border-slate-200" },
];

const NOTES = [
  { key: "allergies", label: "profile.allergies", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  { key: "conditions", label: "profile.conditions", tone: "border-slate-200 bg-slate-50 text-slate-800" },
  { key: "medications", label: "profile.medications", tone: "border-slate-200 bg-slate-50 text-slate-800" },
];

export default function PatientSummary({ patientAddress }) {
  const { keyPair } = useApp();
  const t = useT();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!patientAddress || !keyPair) return undefined;

    (async () => {
      try {
        const p = await loadPatientProfile(patientAddress, keyPair);
        if (!cancelled) setProfile(p);
      } catch (err) {
        // No profile, or no key sealed to this doctor. Both are ordinary.
        console.warn("[profile] not available:", err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patientAddress, keyPair]);

  if (!hasContent(profile)) return null;

  const age = ageFrom(profile.dateOfBirth);

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 font-bold text-slate-900">
          {profile.fullName || t("profile.patientDetails")}
        </h2>
        {age !== "" && (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
            {t("profile.ageYears", { age })}
          </span>
        )}
        {CHIPS.map((c) =>
          profile[c.key] ? (
            <span
              key={c.key}
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${c.tone}`}
            >
              {profile[c.key]}
            </span>
          ) : null
        )}
      </div>

      <div className="mt-3 space-y-2">
        {NOTES.map((n) =>
          profile[n.key] ? (
            <div key={n.key} className={`rounded-xl border p-3 ${n.tone}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {t(n.label)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{profile[n.key]}</p>
            </div>
          ) : null
        )}
      </div>

      {(profile.emergencyName || profile.emergencyPhone) && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold">{t("profile.emergencyContact")}: </span>
          {profile.emergencyName}
          {profile.emergencyPhone ? (
            <a className="ml-2 font-semibold text-brand-700" href={`tel:${profile.emergencyPhone}`}>
              {profile.emergencyPhone}
            </a>
          ) : null}
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500">🔒 {t("profile.healthDecrypted")}</p>
    </section>
  );
}
