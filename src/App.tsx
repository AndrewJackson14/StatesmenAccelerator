import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import ProtectedRoute from '@/auth/ProtectedRoute';
import AppShell from '@/components/AppShell';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ProfilePage from '@/pages/ProfilePage';
import GentlemanDashboard from '@/pages/dashboards/GentlemanDashboard';
import CaptainDashboard from '@/pages/dashboards/CaptainDashboard';
import HeadmasterDashboard from '@/pages/dashboards/HeadmasterDashboard';
import OfficerDashboard from '@/pages/dashboards/OfficerDashboard';
import AlumniDashboard from '@/pages/dashboards/AlumniDashboard';

function RoleHome() {
  const { role, loading } = useAuth();
  if (loading) return null;
  switch (role) {
    case 'gentleman':
      return <GentlemanDashboard />;
    case 'captain':
      return <CaptainDashboard />;
    case 'headmaster':
      return <HeadmasterDashboard />;
    case 'officer':
      return <OfficerDashboard />;
    case 'alumni':
      return <AlumniDashboard />;
    default:
      return (
        <div className="card">
          <h2 className="text-xl">No role assigned</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your account has no role yet. Contact the Headmaster to be enrolled.
          </p>
        </div>
      );
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<RoleHome />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
