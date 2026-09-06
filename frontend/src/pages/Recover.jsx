/**
 * Recover an account with a recovery key.
 *
 * Three steps, all of the cryptography on this device:
 *
 *   1. ask the server for the sealed recovery vault and a challenge
 *   2. open that vault with the code, and sign the challenge with the key
 *      inside it - proving possession without revealing the code
 *   3. re-seal the wallet under a new password and send both together
 *
 * The recovery code never leaves the browser. The server checks only that the
 * signature recovers to the address already on the account, so this cannot be
 * used to take over someone else's account: without the code, no signature.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import { useT } from "../i18n";
import { api } from "../lib/api";
import { isValidCode, openRecovery } from "../lib/recovery";
import { reseal } from "../lib/wallet";
import { MIN_LENGTH, STRENGTH, passwordProblem, scorePassword } from "../lib/password";

export default function Recover() {
  const t = useT();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const [challenge, setChallenge] = useState(null); // { vault, salt, challenge }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const strength = scorePassword(password);
  const meter = STRENGTH[strength.score];
  const problem = passwordProblem(password, confirm);

  const findAccount = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setChallenge(await api.recoverStart({ email: email.trim() }));
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (e) => {
    e.preventDefault();
    if (!isValidCode(code)) {
      setError(t("recovery.badFormat"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Opening it here is the check: a wrong code simply will not decrypt.
      await openRecovery(code, challenge.vault, challenge.salt);
      setStep(3);
    } catch {
      setError(t("recovery.wrongCode"));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e) => {
    e.preventDefault();
    if (problem) {
      setError(t(problem));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const opened = await openRecovery(code, challenge.vault, challenge.salt);

      // Prove we hold the key, without ever sending the code.
      const signature = await new ethers.Wallet(opened.privateKey).signMessage(challenge.challenge);
      const resealed = await reseal(opened.privateKey, password);

      await api.recoverFinish({
        challenge: challenge.challenge,
        signature,
        newPassword: password,
        vault: resealed.vault,
        salt: resealed.salt,
      });

      navigate("/login", { replace: true, state: { recovered: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-aurora flex min-h-[100dvh] items-center justify-center p-5">
      <div className="glass w-full max-w-md border p-6">
        <h1 className="text-2xl font-extrabold text-slate-900">🗝️ {t("recovery.pageTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t(`recovery.step${step}Hint`)}</p>

        <ol className="mt-4 flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <li
              key={n}
              className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-brand-600" : "bg-slate-200"}`}
            />
          ))}
        </ol>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {step === 1 && (
          <form onSubmit={findAccount} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {t("auth.email")}
              </span>
              <input
                type="email"
                className="input-lg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t("common.loading") : t("common.continue")}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={checkCode} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {t("recovery.enterCode")}
              </span>
              <input
                className="input-lg text-center font-mono tracking-wider"
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </label>
            <p className="text-xs text-slate-400">{t("recovery.codeHint")}</p>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t("recovery.checking") : t("common.continue")}
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={finish} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {t("password.new")}
              </span>
              <input
                type={show ? "text" : "password"}
                className="input-lg"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            {password && (
              <div>
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
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {t("password.confirm")}
              </span>
              <input
                type={show ? "text" : "password"}
                className="input-lg"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
                className="h-4 w-4"
              />
              {t("password.showPasswords")}
            </label>

            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              🔒 {t("recovery.resealNote")}
            </p>

            <button
              type="submit"
              disabled={busy || Boolean(problem)}
              className="btn-primary w-full disabled:opacity-50"
            >
              {busy ? t("password.changing") : t("recovery.finish")}
            </button>
            <p className="text-xs text-slate-400">{t("password.minLength", { n: MIN_LENGTH })}</p>
          </form>
        )}

        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-brand-600">
          {t("recovery.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
