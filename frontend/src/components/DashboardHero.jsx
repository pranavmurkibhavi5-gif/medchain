/**
 * The banner across the top of both dashboards.
 *
 * A deep brand gradient with a faint ledger grid and two slow-drifting orbs.
 * It is meant to look considered rather than loud: this is a medical records
 * application, and a background that fights the content would undermine it.
 *
 * Everything decorative sits behind `aria-hidden` and is purely CSS, so it
 * costs no images, no library and nothing to download.
 */
import { useT } from "../i18n";
import Avatar from "./Avatar";

export default function DashboardHero({ name, wallet, subtitle, stats = [] }) {
  const t = useT();

  return (
    <section className="hero-gradient hero-grid relative overflow-hidden rounded-3xl p-5 text-white shadow-lg">
      {/* Decoration */}
      <span
        aria-hidden="true"
        className="hero-orb pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="hero-orb pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-emerald-300/20 blur-2xl"
        style={{ animationDelay: "-6s" }}
      />

      <div className="relative flex items-center gap-3">
        <Avatar wallet={wallet} name={name} size="lg" ring />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">
            {t("app.name")}
          </p>
          <h1 className="truncate text-2xl font-extrabold leading-tight">{name}</h1>
          {subtitle && <p className="truncate text-sm text-white/80">{subtitle}</p>}
        </div>
      </div>

      {stats.length > 0 && (
        <dl className="relative mt-5 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/20 bg-white/10 px-2 py-3 text-center backdrop-blur-sm"
            >
              <dt className="text-[11px] font-medium leading-tight text-white/75">{s.label}</dt>
              <dd className="mt-0.5 text-2xl font-extrabold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="relative mt-4 flex items-center gap-1.5 text-xs text-white/75">
        <span aria-hidden="true">🔒</span>
        {t("dashboard.heroSecure")}
      </p>
    </section>
  );
}
