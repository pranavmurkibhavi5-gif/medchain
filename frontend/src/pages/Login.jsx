import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Alert, Spinner } from "../components/ui";

export default function Login() {
  const { user, login, loadingUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loadingUser && user) return <Navigate to={location.state?.from || `/${user.role}`} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      navigate(location.state?.from || `/${u.role}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg">
            &#129658;
          </span>
          <span className="font-bold">MedChain</span>
        </Link>

        <div>
          <h2 className="text-4xl font-bold leading-tight">
            Your records.
            <br />
            Your keys.
            <br />
            <span className="text-brand-400">Your decision.</span>
          </h2>
          <p className="mt-5 max-w-md text-slate-300">
            Encrypted in the browser, stored off-chain, anchored to Ethereum. Nobody reads a record
            without a permission you granted on-chain.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          S.G. Balekundri Institute of Technology &middot; Belagavi
        </p>
      </div>

      {/* Form */}
      <div className="flex w-full items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Link to="/" className="mb-8 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white">
                &#129658;
              </span>
              <span className="font-bold text-slate-900">MedChain</span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to reach your dashboard.</p>

          {error && (
            <div className="mt-5">
              <Alert kind="error" onClose={() => setError("")}>
                {error}
              </Alert>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Spinner /> : null} Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New here?{" "}
            <Link to="/register" className="link font-semibold">
              Create an account
            </Link>
          </p>

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Demo administrator</p>
            <p className="mono mt-1">admin@bmr.local / Admin@12345</p>
            <p className="mt-1.5 text-[11px]">Change these before any public deployment.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
