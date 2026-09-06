/**
 * Find a doctor.
 *
 * A patient browses registered doctors, searches by name, and filters by
 * specialisation. The filter offers only specialisations that actually exist
 * in the directory, so it never shows an option that returns nothing.
 *
 * Everything shown here is self-declared professional information. Whether the
 * licence has been checked by an administrator is shown separately, as a
 * verified badge, so an unverified doctor is not silently passed off as
 * verified.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { experienceLabel, iconFor } from "../../lib/doctors";
import { Spinner } from "../../components/ui";
import Avatar from "../../components/Avatar";

export default function FindDoctors() {
  const { address, contract, notify } = useApp();
  const t = useT();

  const [doctors, setDoctors] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [query, setQuery] = useState("");
  const [spec, setSpec] = useState("");
  const [granted, setGranted] = useState({});
  const [loading, setLoading] = useState(true);

  const search = useCallback(
    async (term, specialization) => {
      setLoading(true);
      try {
        const { doctors } = await api.doctors(term, specialization);
        setDoctors(doctors);

        // Which of these already have access, so the card can say so instead
        // of offering to grant something that is already granted.
        try {
          const c = await contract();
          const states = await Promise.all(
            doctors.map((d) => c.hasAccess(address, d.walletAddress, 0n).catch(() => false))
          );
          setGranted(
            Object.fromEntries(doctors.map((d, i) => [d.walletAddress.toLowerCase(), states[i]]))
          );
        } catch {
          // The directory is still useful without on-chain state.
          setGranted({});
        }
      } catch (err) {
        notify(err.message, "error");
      } finally {
        setLoading(false);
      }
    },
    [address, contract, notify]
  );

  useEffect(() => {
    api
      .specializations()
      .then(({ specializations }) => setSpecs(specializations || []))
      .catch(() => setSpecs([]));
  }, []);

  useEffect(() => {
    search(query, spec);
    // Refetch when the filter changes; the text search is submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{t("doctor.findTitle")}</h1>
        <p className="text-slate-500">{t("doctor.findHint")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(query, spec);
        }}
        className="flex gap-2"
      >
        <input
          className="input-lg flex-1"
          placeholder={t("doctor.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn-primary px-5">
          🔍
        </button>
      </form>

      <select className="input-lg" value={spec} onChange={(e) => setSpec(e.target.value)}>
        <option value="">{t("doctor.allSpecializations")}</option>
        {specs.map((s) => (
          <option key={s.name} value={s.name}>
            {iconFor(s.name)} {s.name} ({s.count})
          </option>
        ))}
      </select>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : doctors.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="text-4xl">🔍</div>
          <p className="mt-3 font-semibold text-slate-800">{t("doctor.noneFound")}</p>
          {spec && (
            <button onClick={() => setSpec("")} className="btn-ghost mt-4">
              {t("doctor.clearFilter")}
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {doctors.map((d) => (
            <li key={d.walletAddress} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <Avatar wallet={d.walletAddress} name={d.name} size="lg" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-slate-900">{d.name}</p>
                    {d.verified && (
                      <span title={t("doctor.verified")} className="shrink-0 text-brand-600">
                        ✔️
                      </span>
                    )}
                  </div>

                  {d.qualification && (
                    <p className="truncate text-sm text-slate-600">{d.qualification}</p>
                  )}
                  {d.specialization && (
                    <p className="truncate text-sm text-slate-500">
                      {iconFor(d.specialization)} {d.specialization}
                    </p>
                  )}

                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    {experienceLabel(d.experienceYears, t) && (
                      <span>{experienceLabel(d.experienceYears, t)}</span>
                    )}
                    {d.hospital && <span>🏥 {d.hospital}</span>}
                    {d.location && <span>📍 {d.location}</span>}
                  </div>

                  {d.availability && (
                    <p className="mt-1 text-xs text-emerald-700">🕒 {d.availability}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/app/doctor/${d.walletAddress}`} className="btn-primary btn-sm">
                  {t("doctor.viewProfile")}
                </Link>
                {granted[d.walletAddress?.toLowerCase()] && (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    ✓ {t("doctor.hasAccess")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
