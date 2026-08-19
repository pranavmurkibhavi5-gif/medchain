import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function NotFound() {
  const { user } = useApp();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl">&#129658;</p>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-500">That route does not exist in MedChain.</p>
      <Link to={user ? `/${user.role}` : "/"} className="btn-primary mt-6">
        {user ? "Back to dashboard" : "Back to home"}
      </Link>
    </div>
  );
}
