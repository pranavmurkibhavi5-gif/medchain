/**
 * Change password, on the Profile screen.
 *
 * The password does two jobs here: it authenticates the account, and it
 * derives the key that opens the wallet vault. So this does not simply post a
 * new password - it opens the vault with the old one, re-seals it under the
 * new one, and sends both together. If the old password is wrong the vault
 * will not open, and nothing is sent at all.
 *
 * Requires the session to be unlocked, because the private key has to be in
 * memory to re-seal it.
 */
import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { openVault, reseal } from "../lib/wallet";
import { MIN_LENGTH, STRENGTH, passwordProblem, scorePassword } from "../lib/password";

export default function ChangePassword() {
  const { user, secret, unlocked, notify } = useApp();
  const t = useT();

  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  // Email verification. `mailReady` is null until the server has been asked,
  // so the code box never flickers into view on an install that cannot send.
  const [mailReady, setMailReady] = useState(null);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const strength = scorePassword(next);
  const meter = STRENGTH[strength.score];
  const problem = passwordProblem(next, confirm, current);
  const matches = confirm.length > 0 && next === confirm;

  // Ask once, when the panel is opened, whether a code can be sent at all.
  useEffect(() => {
    if (!open || mailReady !== null) return;
    api
      .health()
      .then((h) => setMailReady(Boolean(h?.mail?.configured)))
      .catch(() => setMailReady(false));
  }, [open, mailReady]);

  // Simple resend cooldown, so the button cannot be hammered.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const sendCode = async () => {
    setSending(true);
    setError("");
    try {
      const res = await api.requestPasswordCode();
      setSentTo(res.sentTo || "");
      setCooldown(45);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setCode("");
    setSentTo("");
    setError("");
    setShow(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setDone(false);

    if (problem) {
      setError(t(problem));
      return;
    }

    setBusy(true);
    try {
      let payload = { currentPassword: current, newPassword: next };
      if (mailReady) payload.code = code.trim();

      if (user?.hasVault) {
        // Prove the old password locally by opening the vault with it. This
        // also guarantees we can re-seal, so the server is never asked to
        // change a password we could not follow through on.
        const { vault, salt } = await api.getVault();
        try {
          await openVault(current, vault, salt);
        } catch (err) {
          if (err.code === "WRONG_PASSWORD") throw new Error(t("password.errWrongCurrent"));
          throw err;
        }
        const resealed = await reseal(secret.privateKey, next);
        payload = { ...payload, vault: resealed.vault, salt: resealed.salt };
      }

      await api.changePassword(payload);
      reset();
      setDone(true);
      notify(t("password.changed"), "success");
    } catch (err) {
      setError(err.message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setDone(false);
        }}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-left">
          <span className="block font-semibold text-slate-900">🔑 {t("password.title")}</span>
          <span className="block text-xs text-slate-500">{t("password.hint")}</span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {!unlocked ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t("password.needUnlock")}
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Field
                label={t("password.current")}
                value={current}
                onChange={setCurrent}
                show={show}
                autoComplete="current-password"
              />

              <div>
                <Field
                  label={t("password.new")}
                  value={next}
                  onChange={setNext}
                  show={show}
                  autoComplete="new-password"
                />

                {next && (
                  <div className="mt-2">
                    <div className="flex h-1.5 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-full flex-1 rounded-full ${
                            i < strength.score ? meter.tone : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`mt-1 text-xs font-semibold ${meter.text}`}>{t(meter.label)}</p>
                    {strength.common && (
                      <p className="mt-1 text-xs text-rose-600">{t("password.errCommon")}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Field
                  label={t("password.confirm")}
                  value={confirm}
                  onChange={setConfirm}
                  show={show}
                  autoComplete="new-password"
                />
                {confirm.length > 0 && (
                  <p className={`mt-1 text-xs ${matches ? "text-emerald-600" : "text-rose-600"}`}>
                    {matches ? `✓ ${t("password.matches")}` : t("password.errMismatch")}
                  </p>
                )}
              </div>

              {mailReady && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {t("password.verifyTitle")}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {sentTo
                      ? t("password.codeSentTo", { email: sentTo })
                      : t("password.verifyHint")}
                  </p>

                  <div className="mt-2 flex gap-2">
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      className="input-lg flex-1 text-center font-mono text-lg tracking-[0.4em]"
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    />
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={sending || cooldown > 0}
                      className="btn-ghost shrink-0 border border-slate-200 disabled:opacity-50"
                    >
                      {sending
                        ? t("password.sending")
                        : cooldown > 0
                          ? t("password.resendIn", { n: cooldown })
                          : sentTo
                            ? t("password.resend")
                            : t("password.sendCode")}
                    </button>
                  </div>
                </div>
              )}

              {mailReady === false && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {t("password.noEmailVerification")}
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={(e) => setShow(e.target.checked)}
                  className="h-4 w-4"
                />
                {t("password.showPasswords")}
              </label>

              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                ⚠️ {t("password.vaultWarning")}
              </p>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
              {done && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  ✓ {t("password.changed")}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  busy || Boolean(problem) || !current || (mailReady && code.length !== 6)
                }
                className="btn-primary w-full disabled:opacity-50"
              >
                {busy ? t("password.changing") : t("password.change")}
              </button>

              <p className="text-xs text-slate-400">
                {t("password.minLength", { n: MIN_LENGTH })}
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ label, value, onChange, show, autoComplete }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={show ? "text" : "password"}
        className="input-lg"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </label>
  );
}
