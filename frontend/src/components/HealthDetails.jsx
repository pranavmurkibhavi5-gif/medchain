/**
 * The patient's own health details, on the Profile screen.
 *
 * Everything typed here is encrypted in the browser before it leaves the
 * device, exactly like a record. The server stores ciphertext and per-doctor
 * sealed keys, so it can display this data to nobody - including an
 * administrator.
 */
import { useCallback, useEffect, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { PROFILE_FIELDS, EMPTY_PROFILE, ageFrom } from "../lib/profile";
import { loadMyProfile, saveMyProfile } from "../lib/profile-store";
import { Spinner } from "./ui";

export default function HealthDetails() {
  const { keyPair, address, notify } = useApp();
  const t = useT();

  const [form, setForm] = useState(EMPTY_PROFILE);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!keyPair) return;
    setLoading(true);
    try {
      const mine = await loadMyProfile(keyPair);
      if (mine) {
        setForm(mine.data);
        setRecipients(mine.recipients);
      }
    } catch (err) {
      console.error("[profile] load failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, [keyPair]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveMyProfile(form, keyPair, address, recipients);
      setDirty(false);
      notify(t("profile.healthSaved"), "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const age = ageFrom(form.dateOfBirth);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-left">
          <span className="block font-semibold text-slate-900">🩺 {t("profile.health")}</span>
          <span className="block text-xs text-slate-500">{t("profile.healthHint")}</span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="h-6 w-6 text-brand-600" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {PROFILE_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {t(f.label)}
                      {f.key === "dateOfBirth" && age !== "" && (
                        <span className="ml-2 font-normal text-slate-500">
                          {t("profile.ageYears", { age })}
                        </span>
                      )}
                    </span>

                    {f.options ? (
                      <select className="input-lg" value={form[f.key]} onChange={set(f.key)}>
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {o || "—"}
                          </option>
                        ))}
                      </select>
                    ) : f.long ? (
                      <textarea
                        rows={2}
                        className="input-lg"
                        value={form[f.key]}
                        onChange={set(f.key)}
                      />
                    ) : (
                      <input
                        type={f.type || "text"}
                        className="input-lg"
                        value={form[f.key]}
                        onChange={set(f.key)}
                      />
                    )}
                  </label>
                ))}
              </div>

              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                🔒 {t("profile.healthEncrypted")}
              </p>

              {recipients.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {t("profile.healthSharedWith", { count: recipients.length })}
                </p>
              )}

              <button
                onClick={save}
                disabled={saving || !dirty}
                className="btn-primary mt-4 w-full disabled:opacity-50"
              >
                {saving ? t("profile.healthSaving") : t("common.save")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
