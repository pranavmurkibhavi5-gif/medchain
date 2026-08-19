import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Alert, Spinner } from "../components/ui";

export default function Register() {
  const { user, register, loadingUser } = useApp();
  const navigate = useNavigate();

  const [role, setRole] = useState("patient");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    dateOfBirth: "",
    bloodGroup: "",
    phone: "",
    specialization: "",
    licenseId: "",
    hospital: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loadingUser && user) return <Navigate to={`/${user.role}`} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password.length < 8) return setError("Password must be at least 8 characters");
    if (form.password !== form.confirm) return setError("Passwords do not match");
    if (role === "doctor" && !form.licenseId.trim()) {
      return setError("A medical licence ID is required to register as a doctor");
    }

    setBusy(true);
    try {
      const { confirm, ...payload } = form;
      const u = await register({ ...payload, role, email: form.email.trim() });
      navigate(`/${u.role}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="mb-7 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-xl text-white">
            &#129658;
          </span>
          <span className="text-lg font-bold text-slate-900">MedChain</span>
        </Link>

        <div className="card card-pad">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            You will link MetaMask right after signing up - that wallet becomes your on-chain identity.
          </p>

          {/* Role picker */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { key: "patient", icon: "\u{1F9D1}", label: "Patient", hint: "Own and control records" },
              { key: "doctor", icon: "\u{1F469}‍⚕️", label: "Doctor", hint: "Request patient access" },
            ].map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  role === r.key
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-2xl">{r.icon}</div>
                <div className="mt-1.5 font-semibold text-slate-900">{r.label}</div>
                <div className="text-xs text-slate-500">{r.hint}</div>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-5">
              <Alert kind="error" onClose={() => setError("")}>
                {error}
              </Alert>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">Full name</label>
              <input
                required
                className="input"
                placeholder={role === "doctor" ? "Dr. Afziya Garag" : "Rakesh Patil"}
                value={form.name}
                onChange={set("name")}
              />
            </div>

            <div>
              <label className="label">Email address</label>
              <input
                required
                type="email"
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={set("email")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Password</label>
                <input
                  required
                  type="password"
                  className="input"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={set("password")}
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  required
                  type="password"
                  className="input"
                  placeholder="Repeat it"
                  value={form.confirm}
                  onChange={set("confirm")}
                />
              </div>
            </div>

            {role === "patient" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">Date of birth</label>
                  <input type="date" className="input" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
                </div>
                <div>
                  <label className="label">Blood group</label>
                  <select className="input" value={form.bloodGroup} onChange={set("bloodGroup")}>
                    <option value="">Select</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" placeholder="Optional" value={form.phone} onChange={set("phone")} />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Specialization</label>
                  <input
                    className="input"
                    placeholder="Cardiology"
                    value={form.specialization}
                    onChange={set("specialization")}
                  />
                </div>
                <div>
                  <label className="label">
                    Medical licence ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    className="input"
                    placeholder="KA-MED-1042"
                    value={form.licenseId}
                    onChange={set("licenseId")}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Hospital / clinic</label>
                  <input
                    className="input"
                    placeholder="Optional"
                    value={form.hospital}
                    onChange={set("hospital")}
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Spinner /> : null} Create {role} account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already registered?{" "}
            <Link to="/login" className="link font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
