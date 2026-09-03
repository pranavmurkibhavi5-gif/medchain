/**
 * Application state.
 *
 * Replaces the previous MetaMask-driven context. The blockchain identity now
 * comes from the embedded wallet (see lib/wallet.js), so the UI deals only in
 * "signed in" and "unlocked" - never in wallets, networks or gas.
 *
 * Three states matter:
 *   signed out          - no token
 *   signed in, locked   - token is valid but the vault has not been opened
 *                         (e.g. after a page refresh; the password is never
 *                         persisted, so it must be entered again)
 *   signed in, unlocked - private key held in memory, transactions possible
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";

import { api, setToken, getToken } from "../lib/api";
import { createVault, openVault, makeSigner, clearSigners } from "../lib/wallet";
import { CONTRACT_ADDRESS, RPC_URL, ABI } from "../lib/web3";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Held in memory only. Never written to storage.
  const [secret, setSecret] = useState(null); // { address, privateKey, keyPair }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, kind = "info") => {
    setToast({ message, kind, id: Date.now() });
    setTimeout(() => setToast((t) => (t && t.message === message ? null : t)), 4500);
  }, []);

  // ---------------------------------------------------------------- session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setLoadingUser(false);
        return;
      }
      try {
        const { user } = await api.me();
        if (!cancelled) setUser(user);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorised = () => {
      setUser(null);
      setSecret(null);
    };
    window.addEventListener("bmr:unauthorised", onUnauthorised);
    return () => window.removeEventListener("bmr:unauthorised", onUnauthorised);
  }, []);

  /** Make sure the account can pay for its own transactions. Silent, best-effort. */
  const ensureGas = useCallback(async () => {
    try {
      return await api.ensureGas();
    } catch (err) {
      console.warn("[gas] sponsorship unavailable:", err.message);
      return { funded: false, reason: err.message };
    }
  }, []);

  // ------------------------------------------------------------------- auth
  /**
   * Create the account and its blockchain identity in one step. The user only
   * ever supplies name, email and password.
   */
  const register = useCallback(
    async (form) => {
      setBusy(true);
      try {
        const { token, user } = await api.register(form);
        setToken(token);

        const created = await createVault(form.password);
        await api.putVault({
          vault: created.vault,
          salt: created.salt,
          address: created.address,
          encryptionPublicKey: created.keyPair.publicKey,
        });

        const { user: fresh } = await api.me();
        setUser(fresh);
        setSecret({
          address: created.address,
          privateKey: created.privateKey,
          keyPair: created.keyPair,
        });

        ensureGas(); // fire and forget; the first transaction waits on it
        return fresh;
      } finally {
        setBusy(false);
      }
    },
    [ensureGas]
  );

  /** Sign in and open the vault with the same password. */
  const login = useCallback(
    async (email, password) => {
      setBusy(true);
      try {
        const { token, user } = await api.login({ email, password });
        setToken(token);
        setUser(user);

        if (user.hasVault) {
          await unlockWith(password);
        } else {
          // Account created before the embedded wallet existed, or setup was
          // interrupted: give it an identity now.
          const created = await createVault(password);
          await api.putVault({
            vault: created.vault,
            salt: created.salt,
            address: created.address,
            encryptionPublicKey: created.keyPair.publicKey,
          });
          const { user: fresh } = await api.me();
          setUser(fresh);
          setSecret({
            address: created.address,
            privateKey: created.privateKey,
            keyPair: created.keyPair,
          });
        }

        ensureGas();
        return user;
      } finally {
        setBusy(false);
      }
    },
    [ensureGas]
  );

  /** Open the stored vault. Used at sign-in and after a refresh. */
  const unlockWith = useCallback(async (password) => {
    const { vault, salt } = await api.getVault();
    const opened = await openVault(password, vault, salt);
    setSecret(opened);
    return opened;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setSecret(null);
    clearSigners(); // drop the cached nonce state with the session
  }, []);

  const refreshUser = useCallback(async () => {
    const { user } = await api.me();
    setUser(user);
    return user;
  }, []);

  // ------------------------------------------------------------- blockchain
  /**
   * A contract bound to the user's own key. Callers never think about signers.
   * Gas is topped up first so a transaction cannot fail for lack of funds.
   */
  const contract = useCallback(async () => {
    if (!secret) throw new Error("LOCKED");
    if (!CONTRACT_ADDRESS) throw new Error("NO_CONTRACT");
    await ensureGas();
    const signer = makeSigner(secret.privateKey, RPC_URL);
    return new Contract(CONTRACT_ADDRESS, ABI, signer);
  }, [secret, ensureGas]);

  /** Register on-chain if this account has not been yet. Idempotent. */
  const ensureOnChainIdentity = useCallback(async () => {
    if (!secret || !user) return false;
    const c = await contract();
    try {
      if (user.role === "patient") {
        if (await c.isPatient(secret.address)) return true;
        const tx = await c.registerPatient(user.name, "");
        await tx.wait();
      } else if (user.role === "doctor") {
        if (await c.isDoctor(secret.address)) return true;
        const tx = await c.registerDoctor(
          user.name,
          user.specialization || "General",
          user.licenseId || "N/A"
        );
        await tx.wait();
      }
      return true;
    } catch (err) {
      console.error("[chain] identity registration failed:", err.message);
      throw err;
    }
  }, [secret, user, contract]);

  const value = useMemo(
    () => ({
      user,
      loadingUser,
      busy,
      register,
      login,
      logout,
      refreshUser,
      setUser,

      secret,
      unlocked: Boolean(secret),
      address: secret?.address || user?.walletAddress || "",
      keyPair: secret?.keyPair || null,
      unlockWith,
      contract,
      ensureGas,
      ensureOnChainIdentity,

      toast,
      notify,
    }),
    [
      user, loadingUser, busy, register, login, logout, refreshUser,
      secret, unlockWith, contract, ensureGas, ensureOnChainIdentity, toast, notify,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
