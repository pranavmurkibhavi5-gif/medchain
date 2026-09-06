/** Small shared presentational pieces used across every dashboard. */
import { Link } from "react-router-dom";
import { txUrl, addressUrl, shortAddress } from "../lib/web3";

export function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "brand" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className="card card-pad animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {icon && (
          <span className={`rounded-xl p-2.5 text-xl leading-none ${tones[tone]}`}>{icon}</span>
        )}
      </div>
    </div>
  );
}

export function Alert({ kind = "info", title, children, onClose }) {
  const styles = {
    info: "bg-brand-50 border-brand-200 text-brand-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-rose-50 border-rose-200 text-rose-900",
  };
  const icons = { info: "i", success: "✓", warn: "!", error: "✕" };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[kind]}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
          {icons[kind]}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "\u{1F4C1}", title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Monospace address with copy + explorer link. */
export function Address({ value, link = true, short = true }) {
  if (!value) return <span className="text-slate-400">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="mono rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
        {short ? shortAddress(value) : value}
      </code>
      <button
        onClick={() => navigator.clipboard.writeText(value)}
        title="Copy address"
        className="text-slate-400 hover:text-slate-600"
      >
        &#128203;
      </button>
      {link && (
        <a
          href={addressUrl(value)}
          target="_blank"
          rel="noreferrer"
          title="View on block explorer"
          className="text-slate-400 hover:text-brand-600"
        >
          &#8599;
        </a>
      )}
    </span>
  );
}

/** Transaction hash with an explorer link - the "blockchain proof" chip. */
export function TxLink({ hash, label = "View transaction" }) {
  if (!hash) return null;
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="badge-blue hover:bg-brand-100">
      &#128279; {label}
    </a>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const styles = {
    info: "bg-slate-900 text-white",
    success: "bg-emerald-600 text-white",
    warn: "bg-amber-500 text-white",
    error: "bg-rose-600 text-white",
  };
  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 animate-fade-up">
      <div className={`rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${styles[toast.kind]}`}>
        {toast.message}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-md" onClick={onClose} />
      <div
        className={`glass relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} animate-fade-up shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** Ordered progress list used by the upload pipeline. */
export function StepList({ steps, current, error }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const failed = error && active;
        return (
          <li key={step} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                failed
                  ? "bg-rose-100 text-rose-600"
                  : done
                  ? "bg-emerald-100 text-emerald-600"
                  : active
                  ? "bg-brand-100 text-brand-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {failed ? "✕" : done ? "✓" : i + 1}
            </span>
            <span
              className={
                failed
                  ? "text-rose-600 font-medium"
                  : done
                  ? "text-slate-500"
                  : active
                  ? "font-semibold text-slate-900"
                  : "text-slate-400"
              }
            >
              {step}
            </span>
            {active && !error && <Spinner className="h-3.5 w-3.5 text-brand-500" />}
          </li>
        );
      })}
    </ol>
  );
}

export function Crumb({ to, children }) {
  return (
    <Link to={to} className="text-sm text-slate-500 hover:text-slate-800">
      &larr; {children}
    </Link>
  );
}

export function timeAgo(value) {
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function formatDate(value) {
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
