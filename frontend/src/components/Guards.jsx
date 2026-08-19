import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Spinner, Alert } from "./ui";
import { CONTRACT_ADDRESS } from "../lib/web3";

/** Blocks a route until the user is signed in with the right role. */
export function RequireRole({ role, children }) {
  const { user, loadingUser } = useApp();
  const location = useLocation();

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />;

  return children;
}

/**
 * Wraps any view that needs a wallet + unlocked encryption key, and explains
 * exactly what is missing instead of failing silently.
 */
export function RequireWallet({ children }) {
  const { wallet, keyPair, connect, unlockKey, walletBusy, notify } = useApp();

  if (!CONTRACT_ADDRESS) {
    return (
      <Alert kind="warn" title="Smart contract not configured">
        Deploy <code className="mono">MedicalRecord.sol</code> and set{" "}
        <code className="mono">VITE_CONTRACT_ADDRESS</code> in the frontend environment. See{" "}
        <code className="mono">DEPLOYMENT.md</code>.
      </Alert>
    );
  }

  if (!wallet) {
    return (
      <div className="card card-pad text-center">
        <div className="text-4xl">&#129418;</div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900">Connect your wallet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Blockchain actions are signed by you in MetaMask. Nothing is sent on your behalf, and your
          private key never leaves the wallet.
        </p>
        <button onClick={connect} disabled={walletBusy} className="btn-primary mt-5">
          {walletBusy ? <Spinner /> : null} Connect MetaMask
        </button>
      </div>
    );
  }

  if (!keyPair) {
    return (
      <div className="card card-pad text-center">
        <div className="text-4xl">&#128274;</div>
        <h3 className="mt-3 text-lg font-semibold text-slate-900">Unlock your encryption key</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Sign a free message so your browser can derive the key that encrypts and decrypts your
          records. It costs no gas and never leaves this device.
        </p>
        <button
          onClick={() => unlockKey().catch((e) => notify(e.message, "error"))}
          className="btn-primary mt-5"
        >
          Sign to unlock
        </button>
      </div>
    );
  }

  return children;
}
