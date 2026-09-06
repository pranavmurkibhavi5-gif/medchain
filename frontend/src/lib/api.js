/**
 * Thin fetch wrapper around the Express API.
 * The base URL comes from VITE_API_URL so the same build works against
 * localhost during development and Render in production.
 */
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

const TOKEN_KEY = "bmr.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = "GET", body, raw = false, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the API at ${BASE}. Is the backend running?`);
  }

  if (res.status === 401) {
    setToken(null);
    // Let the auth context notice and bounce to /login.
    window.dispatchEvent(new CustomEvent("bmr:unauthorised"));
  }

  if (raw) {
    if (!res.ok) throw new Error((await safeError(res)) || `Request failed (${res.status})`);
    return {
      buffer: new Uint8Array(await res.arrayBuffer()),
      headers: res.headers,
    };
  }

  const text = await res.text();
  const data = text ? safeJson(text) : {};
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

async function safeError(res) {
  try {
    const j = await res.clone().json();
    return j.error;
  } catch {
    return null;
  }
}

export const api = {
  base: BASE,

  // --- system ---
  health: () => request("/api/health"),
  config: () => request("/api/config"),

  // --- auth ---
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload }),
  me: () => request("/api/auth/me"),
  linkWallet: (payload) => request("/api/auth/link-wallet", { method: "POST", body: payload }),
  updateProfile: (payload) => request("/api/auth/profile", { method: "PATCH", body: payload }),
  changePassword: (payload) =>
    request("/api/auth/change-password", { method: "POST", body: payload }),

  // --- embedded wallet ---
  putVault: (payload) => request("/api/wallet/vault", { method: "POST", body: payload }),
  getVault: () => request("/api/wallet/vault"),
  ensureGas: () => request("/api/wallet/ensure-gas", { method: "POST" }),
  sponsorStatus: () => request("/api/wallet/sponsor"),

  // ---- encrypted health profile ----
  putHealthProfile: (payload) => request("/api/health-profile", { method: "PUT", body: payload }),
  myHealthProfile: () => request("/api/health-profile/me"),
  healthProfileOf: (wallet) => request(`/api/health-profile/${wallet}`),

  // ---- appointments ----
  bookAppointment: (payload) => request("/api/appointments", { method: "POST", body: payload }),
  myAppointments: () => request("/api/appointments/mine"),
  updateAppointment: (id, payload) =>
    request(`/api/appointments/${id}`, { method: "PATCH", body: payload }),

  // --- directory ---
  doctors: (q = "", specialization = "") =>
    request(
      `/api/users/doctors?q=${encodeURIComponent(q)}` +
        `&specialization=${encodeURIComponent(specialization)}`
    ),
  patients: (q = "") => request(`/api/users/patients?q=${encodeURIComponent(q)}`),
  userByWallet: (addr) => request(`/api/users/by-wallet/${addr}`),
  specializations: () => request("/api/users/specializations"),

  // --- profile photo ---
  putAvatar: (payload) => request("/api/users/avatar", { method: "PUT", body: payload }),
  deleteAvatar: () => request("/api/users/avatar", { method: "DELETE" }),
  avatarBytes: (wallet) => request(`/api/users/avatar/${wallet}`, { raw: true }),

  // --- records ---
  uploadEncrypted: (envelope, fileName) => {
    const form = new FormData();
    form.append("file", new Blob([envelope], { type: "application/octet-stream" }), fileName);
    return request("/api/records/upload", { method: "POST", body: form, isForm: true });
  },
  confirmRecord: (payload) => request("/api/records/confirm", { method: "POST", body: payload }),
  myRecords: () => request("/api/records/mine"),
  patientRecords: (wallet) => request(`/api/records/patient/${wallet}`),
  recordKey: (recordId) => request(`/api/records/${recordId}/key`),
  recordBlob: (recordId) => request(`/api/records/${recordId}/blob`, { raw: true }),
  shareKey: (recordId, payload) =>
    request(`/api/records/${recordId}/share`, { method: "POST", body: payload }),
  revokeKeys: (payload) => request("/api/records/revoke-keys", { method: "POST", body: payload }),
  sharedWith: (recordId) => request(`/api/records/${recordId}/shared-with`),

  // --- audit ---
  myAudit: (limit = 100) => request(`/api/audit/mine?limit=${limit}`),
  logAudit: (payload) => request("/api/audit", { method: "POST", body: payload }),
  chainEvents: (limit = 40) => request(`/api/audit/chain?limit=${limit}`),

  // --- admin ---
  adminOverview: () => request("/api/admin/overview"),
  adminUsers: (role = "") => request(`/api/admin/users${role ? `?role=${role}` : ""}`),
  adminUpdateUser: (id, patch) => request(`/api/admin/users/${id}`, { method: "PATCH", body: patch }),
  adminRecords: () => request("/api/admin/records"),
  adminActivity: (limit = 60) => request(`/api/admin/activity?limit=${limit}`),
  adminAudit: (limit = 300) => request(`/api/admin/audit?limit=${limit}`),
};
