/**
 * Upload, change or remove your profile photo.
 *
 * The image is cropped square and scaled to 256px in the browser before it is
 * sent, so a phone photograph does not arrive as several megabytes. A preview
 * is shown before anything is saved, so nobody uploads the wrong picture.
 */
import { useRef, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { ACCEPTED, forgetAvatar, prepareAvatar } from "../lib/avatar";
import Avatar from "./Avatar";

export default function ProfilePhoto() {
  const { user, address, notify, refreshUser } = useApp();
  const t = useT();
  const fileRef = useRef(null);

  const [pending, setPending] = useState(null); // { data, type, preview }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Bumped after a change so <Avatar> remounts and refetches.
  const [version, setVersion] = useState(0);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be chosen again after a cancel
    if (!file) return;

    setError("");
    try {
      setPending(await prepareAvatar(file));
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await api.putAvatar({ data: pending.data, type: pending.type });
      forgetAvatar(address);
      setPending(null);
      setVersion((v) => v + 1);
      await refreshUser();
      notify(t("photo.saved"), "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.deleteAvatar();
      forgetAvatar(address);
      setPending(null);
      setVersion((v) => v + 1);
      await refreshUser();
      notify(t("photo.removed"), "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">🖼️ {t("photo.title")}</h2>

      <div className="mt-4 flex items-center gap-4">
        {pending ? (
          <img
            src={pending.preview}
            alt=""
            className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-brand-500"
          />
        ) : (
          <Avatar key={version} wallet={address} name={user?.name} size="xl" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-600">
            {pending ? t("photo.previewHint") : t("photo.hint")}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {pending ? (
              <>
                <button onClick={save} disabled={busy} className="btn-primary btn-sm">
                  {busy ? t("photo.saving") : t("photo.save")}
                </button>
                <button
                  onClick={() => setPending(null)}
                  disabled={busy}
                  className="btn-ghost btn-sm"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="btn-primary btn-sm"
                >
                  {user?.hasAvatar ? t("photo.change") : t("photo.upload")}
                </button>
                {user?.hasAvatar && (
                  <button
                    onClick={remove}
                    disabled={busy}
                    className="btn-ghost btn-sm text-rose-600"
                  >
                    {t("photo.remove")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={pick}
        className="hidden"
      />

      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">{t("photo.storedNote")}</p>
    </section>
  );
}
