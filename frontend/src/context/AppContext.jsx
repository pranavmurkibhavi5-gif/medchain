/**
 * Single app-wide context holding three linked things:
 *
 *   1. the signed-in account (JWT-based),
 *   2. the connected MetaMask wallet + signer,
 *   3. the session encryption keypair derived from a wallet signature.
 *
 * They are together because the record flows need all three at once, and
 * keeping them in one place avoids a tangle of cross-context effects.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken, getToken } from "../lib/api";
import {
  connectWallet,
  switchNetwork,
  getContract,
  CHAIN_ID,
  NETWORK_NAME,
  hasMetaMask,
  humanError,
} from "../lib/web3";
import { deriveKeyPairFromSignature, KEY_DERIVATION_MESSAGE } from "../lib/crypto";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [wallet, setWallet] = useState(null); // { address, chainId }
  const [signer, setSigner] = useState(null);
  const [keyPair, setKeyPair] = useState(null); // { privateKey, publicKey }
  const [walletBusy, setWalletBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, kind = "info") => {
    setToast({ message, kind, id: Date.now() });
    setTimeout(() => setToast((t) => (t && t.message === message ? null : t)), 5200);
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
      setKeyPair(null);
    };
    window.addEventListener("bmr:unauthorised", onUnauthorised);
    return () => window.removeEventListener("bmr:unauthorised", onUnauthorised);
  }, []);

  // React to the user swapping accounts or networks in MetaMask.
  useEffect(() => {
    if (!hasMetaMask()) return;
    const onAccounts = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setWallet(null);
        setSigner(null);
        setKeyPair(null);
        notify("MetaMask disconnected", "warn");
      } else {
        setWallet((w) => (w ? { ...w, address: accounts[0] } : w));
        setKeyPair(null); // different account => different encryption key
        notify("MetaMask account changed - unlock your key again", "warn");
      }
    };
    const onChain = () => window.location.reload();

    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [notify]);

  // ------------------------------------------------------------------ auth
  const login = useCallback(async (email, password) => {
    const { token, user } = await api.login({ email, password });
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user } = await api.register(payload);
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setWallet(null);
    setSigner(null);
    setKeyPair(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { user } = await api.me();
    setUser(user);
    return user;
  }, []);

  // ---------------------------------------------------------------- wallet
  /**
   * Connect MetaMask, make sure the chain is right, derive the encryption
   * keypair, and link the wallet to the account on first use.
   */
  const connect = useCallback(async () => {
    setWalletBusy(true);
    try {
      let { signer: s, address, chainId } = await connectWallet();

      if (chainId !== CHAIN_ID) {
        notify(`Switching MetaMask to ${NETWORK_NAME}...`, "info");
        await switchNetwork(CHAIN_ID);
        ({ signer: s, address, chainId } = await connectWallet());
      }

      setSigner(s);
      setWallet({ address, chainId });

      // Derive the session encryption keypair (one signature, no gas).
      const signature = await s.signMessage(KEY_DERIVATION_MESSAGE);
      const kp = deriveKeyPairFromSignature(signature);
      setKeyPair(kp);

      // Bind wallet + public key to the account, proving ownership.
      if (user) {
        const linkMessage =
          `MedChain wallet link\n\nAccount: ${user.id}\nWallet: ${address}\nIssued: ${new Date().toISOString()}`;
        const linkSig = await s.signMessage(linkMessage);
        const { user: updated } = await api.linkWallet({
          address,
          signature: linkSig,
          message: linkMessage,
          encryptionPublicKey: kp.publicKey,
        });
        setUser(updated);
      }

      notify("Wallet connected and encryption key unlocked", "success");
      return { address, chainId, keyPair: kp };
    } catch (err) {
      notify(humanError(err), "error");
      throw err;
    } finally {
      setWalletBusy(false);
    }
  }, [user, notify]);

  /** Re-derive the key without redoing the whole connect flow. */
  const unlockKey = useCallback(async () => {
    if (!signer) throw new Error("Connect your wallet first");
    const signature = await signer.signMessage(KEY_DERIVATION_MESSAGE);
    const kp = deriveKeyPairFromSignature(signature);
    setKeyPair(kp);
    return kp;
  }, [signer]);

  const contract = useCallback(async () => {
    if (!signer) throw new Error("Connect your MetaMask wallet first");
    return getContract(signer);
  }, [signer]);

  const walletMatchesAccount =
    !user?.walletAddress ||
    !wallet?.address ||
    user.walletAddress.toLowerCase() === wallet.address.toLowerCase();

  const value = useMemo(
    () => ({
      user,
      loadingUser,
      login,
      register,
      logout,
      refreshUser,
      setUser,

      wallet,
      signer,
      keyPair,
      walletBusy,
      connect,
      unlockKey,
      contract,
      walletMatchesAccount,

      toast,
      notify,
    }),
    [
      user, loadingUser, login, register, logout, refreshUser,
      wallet, signer, keyPair, walletBusy, connect, unlockKey, contract,
      walletMatchesAccount, toast, notify,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
