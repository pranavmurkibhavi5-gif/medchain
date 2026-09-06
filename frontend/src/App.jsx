import { useCallback, useState } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";

import { useApp } from "./context/AppContext";
import { hasChosenLanguage } from "./i18n";
import { Spinner } from "./components/ui";

import MobileLayout from "./components/MobileLayout";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

import Unlock from "./pages/app/Unlock";
import PatientHome from "./pages/app/PatientHome";
import DoctorHome from "./pages/app/DoctorHome";
import Upload from "./pages/app/Upload";
import Records from "./pages/app/Records";
import Appointments from "./pages/app/Appointments";
import Info from "./pages/app/Info";
import FindDoctors from "./pages/app/FindDoctors";
import DoctorProfile from "./pages/app/DoctorProfile";
import Requests from "./pages/app/Requests";
import Doctors from "./pages/app/Doctors";
import FindPatient from "./pages/app/FindPatient";
import Profile from "./pages/app/Profile";
import Activity from "./pages/app/Activity";

/** Records of a specific patient, opened by a doctor. */
function PatientRecords() {
  const { address } = useParams();
  return <Records ownerAddress={address} />;
}

/** Everything behind sign-in, plus the unlock gate. */
function Protected({ pendingCount, setCounts }) {
  const { user, loadingUser, unlocked } = useApp();

  if (loadingUser) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // Admins keep the existing desktop console; it is not part of the mobile app.
  if (user.role === "admin") return <Navigate to="/admin" replace />;

  if (!unlocked) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 px-4 py-8">
        <Unlock />
      </div>
    );
  }
  return <MobileLayout pendingCount={pendingCount} />;
}

export default function App() {
  const { user } = useApp();
  const [pendingCount, setPendingCount] = useState(0);

  const setCounts = useCallback(({ pending }) => {
    if (typeof pending === "number") setPendingCount(pending);
  }, []);

  const isDoctor = user?.role === "doctor";

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={hasChosenLanguage() ? "/login" : "/welcome"} replace />}
      />
      <Route path="/welcome" element={<Onboarding />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/app" element={<Protected pendingCount={pendingCount} />}>
        <Route
          index
          element={isDoctor ? <DoctorHome /> : <PatientHome onCounts={setCounts} />}
        />
        <Route path="upload" element={<Upload />} />
        <Route path="records" element={<Records />} />
        <Route path="requests" element={<Requests onCounts={setCounts} />} />
        <Route path="doctors" element={<Doctors />} />
        <Route path="find" element={<FindPatient />} />
        <Route path="patient/:address" element={<PatientRecords />} />
        <Route path="find-doctors" element={<FindDoctors />} />
        <Route path="doctor/:address" element={<DoctorProfile />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="help" element={<Info page="help" />} />
        <Route path="about" element={<Info page="about" />} />
        <Route path="privacy" element={<Info page="privacy" />} />
        <Route path="activity" element={<Activity />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* Legacy desktop routes kept so existing links and the admin console work */}
      <Route path="/patient/*" element={<Navigate to="/app" replace />} />
      <Route path="/doctor/*" element={<Navigate to="/app" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
