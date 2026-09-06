/**
 * Live system status: blockchain, storage, database.
 *
 * Every indicator reflects what /api/health actually reports. Nothing here is
 * hard-coded to green - if the chain is unreachable it says so, and while the
 * check is in flight it says that too. A status light that is always green is
 * decoration, and decoration on a security screen is a lie.
 */
import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { api } from "../lib/api";

const TONES = {
  ok: "text-emerald-600",
  bad: "text-rose-500",
  unknown: "text-slate-400",
};

export default function SystemStatus() {
  const t = useT();
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => !cancelled && setHealth(h))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const chain = health?.chain;

  const items = [
    {
      key: "chain",
      label: t("status.blockchain"),
      state: failed ? "bad" : !health ? "unknown" : chain?.connected ? "ok" : "bad",
      detail: chain?.blockNumber ? `#${chain.blockNumber}` : "",
    },
    {
      key: "ipfs",
      label: t("status.storage"),
      // "pinata" or "local" both mean storage is working; only a missing
      // value is unknown.
      state: failed ? "bad" : !health ? "unknown" : health.ipfs ? "ok" : "bad",
      detail: health?.ipfs || "",
    },
    {
      key: "db",
      label: t("status.database"),
      state: failed ? "bad" : !health ? "unknown" : health.database ? "ok" : "bad",
      detail: health?.database || "",
    },
  ];

  return (
    <section className="glass border p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        🛡️ {t("status.title")}
      </h2>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2.5 text-sm">
            <span className={`status-dot bg-current ${TONES[item.state]}`} />
            <span className="flex-1 text-slate-700">{item.label}</span>
            <span className="font-mono text-xs text-slate-400">
              {item.state === "unknown" ? t("status.checking") : item.detail}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{t("status.note")}</p>
    </section>
  );
}
