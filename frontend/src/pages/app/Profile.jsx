/**
 * Profile and settings.
 *
 * Also the one place where the technical layer is surfaced deliberately: an
 * "Advanced" section for demonstration, plus the Emergency Access notice,
 * which states plainly that the feature is not active.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { Modal } from "../../components/ui";
import HealthDetails from "../../components/HealthDetails";
import MyQrCode from "../../components/MyQrCode";
import ChangePassword from "../../components/ChangePassword";
import RecoveryKey from "../../components/RecoveryKey";
import Accessibility from "../../components/Accessibility";
import ProfilePhoto from "../../components/ProfilePhoto";
import DoctorDetails from "../../components/DoctorDetails";
import Avatar from "../../components/Avatar";
import { CONTRACT_ADDRESS, NETWORK_NAME, EXPLORER, shortAddress } from "../../lib/web3";

export default function Profile() {
  const { user, address, logout, unlocked } = useApp();
  const { t, lang, setLang, languages } = useI18n();
  const navigate = useNavigate();

  const [advanced, setAdvanced] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    if (advanced && !health) api.health().then(setHealth).catch(() => {});
  }, [advanced, health]);

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">{t("profile.title")}</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-4">
          <Avatar wallet={address} name={user?.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">{user?.name}</p>
            <p className="truncate text-sm text-slate-500">{user?.email}</p>
            <span className="badge-blue mt-1 inline-flex">
              {user?.role === "doctor" ? t("auth.doctor") : t("auth.patient")}
            </span>
          </div>
        </div>
      </section>

      {/* Health details - patients only, encrypted before it leaves the device */}
      <ProfilePhoto />

      {user?.role === "doctor" && <DoctorDetails />}

      {user?.role === "patient" && <HealthDetails />}
      {user?.role === "patient" && <MyQrCode />}

      {/* Language */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">{t("language.current")}</h2>
        <div className="mt-3 space-y-2">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left ${
                lang === l.code ? "border-brand-500 bg-brand-50" : "border-slate-200"
              }`}
            >
              <span>
                <span className="block font-semibold text-slate-900">{l.native}</span>
                <span className="block text-xs text-slate-500">{l.label}</span>
              </span>
              {lang === l.code && <span className="text-brand-600">✓</span>}
            </button>
          ))}
        </div>
      </section>

      <ChangePassword />

      <RecoveryKey />

      <Accessibility />

      {/* Help, About, Privacy */}
      <section className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {[
          { to: "/app/help", icon: "❓", label: "help.title" },
          { to: "/app/privacy", icon: "🔐", label: "privacy.title" },
          { to: "/app/about", icon: "ℹ️", label: "about.title" },
        ].map((row) => (
          <button
            key={row.to}
            onClick={() => navigate(row.to)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left"
          >
            <span className="text-xl">{row.icon}</span>
            <span className="flex-1 font-semibold text-slate-900">{t(row.label)}</span>
            <span className="text-slate-400">›</span>
          </button>
        ))}
      </section>

      {/* Security, in plain words */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-emerald-900">
          🛡️ {t("profile.security")}
        </h2>
        <p className="mt-2 text-sm text-emerald-800">{t("profile.securityHint")}</p>
      </section>

      {/* Emergency access - explicitly not active */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900">🚑 {t("emergency.title")}</h2>
          <span className="badge-amber">{t("emergency.badge")}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{t("emergency.description")}</p>
        <p className="mt-2 text-sm font-semibold text-slate-800">{t("emergency.notAvailable")}</p>
      </section>

      {/* Advanced: the technical layer, opt-in */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <button
          onClick={() => setAdvanced((a) => !a)}
          className="flex w-full items-center justify-between px-5 py-4"
        >
          <span className="text-left">
            <span className="block font-semibold text-slate-900">{t("profile.advanced")}</span>
            <span className="block text-xs text-slate-500">{t("profile.advancedHint")}</span>
          </span>
          <span className="text-slate-400">{advanced ? "▲" : "▼"}</span>
        </button>
        {advanced && (
          <dl className="space-y-3 border-t border-slate-100 px-5 py-4 text-sm">
            <Row k={t("tech.network")} v={NETWORK_NAME} />
            <Row k={t("tech.account")} v={address ? shortAddress(address, 6) : "—"} mono />
            <Row k={t("tech.encryption")} v={t("tech.encryptionValue")} />
            <Row k={t("tech.storage")} v={t("tech.storageValue")} />
            <Row k={t("tech.integrity")} v={t("tech.integrityValue")} />
            {CONTRACT_ADDRESS && (
              <div>
                <dt className="font-semibold text-slate-500">{t("tech.contract")}</dt>
                <dd>
                  <a
                    href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-xs text-brand-600"
                  >
                    {CONTRACT_ADDRESS} ↗
                  </a>
                </dd>
              </div>
            )}
            {health && (
              <Row
                k="Status"
                v={`${health.database} · ${health.ipfs} · ${
                  health.chain?.connected ? "chain ok" : "chain offline"
                }`}
              />
            )}
            <p className="pt-1 text-xs text-slate-500">{t("tech.neverOnChain")}</p>
          </dl>
        )}
      </section>

      <button onClick={() => setConfirmOut(true)} className="btn-ghost w-full py-4 text-base font-semibold text-rose-600">
        {t("auth.signOut")}
      </button>

      <Modal
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        title={t("profile.signOutConfirm")}
        footer={
          <>
            <button onClick={() => setConfirmOut(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button onClick={signOut} className="btn-danger">
              {t("auth.signOut")}
            </button>
          </>
        }
      >
        <p className="text-slate-600">{t("auth.passwordImportant")}</p>
      </Modal>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{k}</dt>
      <dd className={`break-all text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
