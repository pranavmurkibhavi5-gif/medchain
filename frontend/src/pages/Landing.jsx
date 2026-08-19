import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { NETWORK_NAME, CONTRACT_ADDRESS, addressUrl } from "../lib/web3";

const FEATURES = [
  {
    icon: "\u{1F510}",
    title: "Encrypted before it leaves you",
    body: "Files are encrypted with AES-256-GCM inside your browser. The server and IPFS only ever hold ciphertext they cannot read.",
  },
  {
    icon: "⛓️",
    title: "Tamper-evident by design",
    body: "Only the keccak256 hash of the encrypted file is written on-chain. Change one byte anywhere and the hash no longer matches.",
  },
  {
    icon: "\u{1F464}",
    title: "The patient holds the keys",
    body: "Doctors must request access. You approve or reject, and you can revoke at any moment - enforced by the smart contract, not by trust.",
  },
  {
    icon: "\u{1F4CB}",
    title: "An audit trail nobody can edit",
    body: "Every upload, request, approval, rejection and revocation is an immutable blockchain event with a public transaction hash.",
  },
  {
    icon: "\u{1F5C4}️",
    title: "Off-chain storage, on-chain proof",
    body: "Full medical files live on IPFS, keeping gas costs flat and the system scalable no matter how large the records get.",
  },
  {
    icon: "\u{1F30D}",
    title: "Reachable from any browser",
    body: "Deployed as a public website on a public Ethereum testnet. No local node, no install - just a browser and MetaMask.",
  },
];

const FLOW = [
  ["Select", "Patient chooses a medical file"],
  ["Validate", "Type and size are checked"],
  ["Encrypt", "AES-256-GCM in the browser"],
  ["Upload", "Ciphertext pinned to IPFS"],
  ["Hash", "keccak256 of the encrypted blob"],
  ["Commit", "Hash + CID written on-chain"],
  ["Confirm", "Transaction mined and verified"],
];

export default function Landing() {
  const { user } = useApp();

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white">
              &#129658;
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">MedChain</span>
          </div>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link to={`/${user.role}`} className="btn-primary btn-sm">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary btn-sm">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/70 via-white to-white" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="badge-blue">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Live on {NETWORK_NAME}
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-6xl">
            Medical records the hospital
            <span className="text-brand-600"> cannot quietly change</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            A blockchain-based system where medical files are encrypted in your browser, stored off-chain
            on IPFS, and anchored to Ethereum by cryptographic hash. Patients decide who reads what -
            and every decision is permanently recorded.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="btn-primary px-6 py-3 text-base">
              Get started
            </Link>
            <Link to="/login" className="btn-ghost px-6 py-3 text-base">
              Sign in
            </Link>
          </div>

          {CONTRACT_ADDRESS && (
            <p className="mt-6 text-xs text-slate-400">
              Smart contract:{" "}
              <a href={addressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer" className="link mono">
                {CONTRACT_ADDRESS}
              </a>
            </p>
          )}
        </div>
      </section>

      {/* The security flow */}
      <section className="border-y border-slate-200 bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">
            What happens when you upload a record
          </h2>
          <div className="mt-8 flex flex-wrap items-stretch justify-center gap-2">
            {FLOW.map(([label, detail], i) => (
              <div key={label} className="flex items-stretch gap-2">
                <div className="w-36 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                    Step {i + 1}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{detail}</div>
                </div>
                {i < FLOW.length - 1 && (
                  <div className="flex items-center text-lg text-slate-300">&rarr;</div>
                )}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
            <strong>The complete medical file is never stored on the blockchain.</strong> Only its hash,
            its IPFS reference and small metadata go on-chain.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Built for security, not just for show
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-pad transition hover:shadow-md">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="border-t border-slate-200 bg-slate-900 py-16 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">Three roles, one ledger</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: "\u{1F9D1}",
                role: "Patient",
                points: ["Upload and encrypt records", "Approve or reject doctors", "Revoke access instantly", "See every access attempt"],
              },
              {
                icon: "\u{1F469}‍⚕️",
                role: "Doctor",
                points: ["Search registered patients", "Request access with a reason", "Read only what was granted", "Blocked the moment it is revoked"],
              },
              {
                icon: "\u{1F6E1}️",
                role: "Admin",
                points: ["Oversee users and doctors", "Monitor system activity", "Inspect on-chain events", "Never able to read a record"],
              },
            ].map((r) => (
              <div key={r.role} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="text-3xl">{r.icon}</div>
                <h3 className="mt-3 text-lg font-bold">{r.role}</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                  {r.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="text-brand-400">&#10003;</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500 sm:px-6">
          <p className="font-semibold text-slate-700">Blockchain-Based Secure Medical Record</p>
          <p className="mt-1">
            Department of Computer Science and Business Systems &middot; S.G. Balekundri Institute of
            Technology, Belagavi
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Academic project running on a public Ethereum testnet. Use dummy medical files only.
          </p>
        </div>
      </footer>
    </div>
  );
}
