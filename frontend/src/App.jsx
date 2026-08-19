import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import { RequireRole } from "./components/Guards";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

import PatientDashboard from "./pages/patient/Dashboard";
import UploadRecord from "./pages/patient/UploadRecord";
import MyRecords from "./pages/patient/MyRecords";
import PatientRequests from "./pages/patient/Requests";
import Permissions from "./pages/patient/Permissions";
import PatientActivity from "./pages/patient/Activity";

import DoctorDashboard from "./pages/doctor/Dashboard";
import FindPatient from "./pages/doctor/FindPatient";
import DoctorRequests from "./pages/doctor/Requests";
import AuthorizedRecords from "./pages/doctor/AuthorizedRecords";
import DoctorActivity from "./pages/doctor/Activity";

import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminRecords from "./pages/admin/Records";
import AdminActivity from "./pages/admin/Activity";
import AdminAudit from "./pages/admin/Audit";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Patient */}
      <Route
        path="/patient"
        element={
          <RequireRole role="patient">
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<PatientDashboard />} />
        <Route path="upload" element={<UploadRecord />} />
        <Route path="records" element={<MyRecords />} />
        <Route path="requests" element={<PatientRequests />} />
        <Route path="permissions" element={<Permissions />} />
        <Route path="activity" element={<PatientActivity />} />
      </Route>

      {/* Doctor */}
      <Route
        path="/doctor"
        element={
          <RequireRole role="doctor">
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<DoctorDashboard />} />
        <Route path="patients" element={<FindPatient />} />
        <Route path="requests" element={<DoctorRequests />} />
        <Route path="records" element={<AuthorizedRecords />} />
        <Route path="activity" element={<DoctorActivity />} />
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="records" element={<AdminRecords />} />
        <Route path="activity" element={<AdminActivity />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>

      <Route path="/dashboard" element={<Navigate to="/patient" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
