import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import ProtectedRoute from '@/auth/ProtectedRoute';
import AppShell from '@/components/AppShell';
import OnboardingFlow from '@/components/OnboardingFlow';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import SmsOptInPage from '@/pages/SmsOptInPage';
import ProfilePage from '@/pages/ProfilePage';
import AssessmentsPage from '@/pages/AssessmentsPage';
import MessagesPage from '@/pages/MessagesPage';
import SessionsPage from '@/pages/SessionsPage';
import PaymentPage from '@/pages/PaymentPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import DataExportPage from '@/pages/DataExportPage';
import ApplicationQueuePage from '@/pages/headmaster/ApplicationQueuePage';
import InterviewAvailabilityPage from '@/pages/headmaster/InterviewAvailabilityPage';
import BookShipmentQueuePage from '@/pages/headmaster/BookShipmentQueuePage';
import GentlemanDashboard from '@/pages/dashboards/GentlemanDashboard';
import CaptainDashboard from '@/pages/dashboards/CaptainDashboard';
import HeadmasterDashboard from '@/pages/dashboards/HeadmasterDashboard';
import OfficerDashboard from '@/pages/dashboards/OfficerDashboard';
import AlumniDashboard from '@/pages/dashboards/AlumniDashboard';

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile, role, loading } = useAuth();
  if (loading) return null;
  if (role === 'headmaster' || role === 'officer' || role === 'alumni') return <>{children}</>;
  if (profile && !profile.onboarding_complete) return <OnboardingFlow />;
  return <>{children}</>;
}

function RoleHome() {
  const { role, loading } = useAuth();
  if (loading) return null;
  switch (role) {
    case 'gentleman': return <GentlemanDashboard />;
    case 'captain': return <CaptainDashboard />;
    case 'headmaster': return <HeadmasterDashboard />;
    case 'officer': return <OfficerDashboard />;
    case 'alumni': return <AlumniDashboard />;
    default:
      return (
        <div className="card">
          <h2 className="text-xl">No role assigned</h2>
          <p className="mt-2 text-sm text-slate-400">Your account has no role yet. Contact the Headmaster to be enrolled.</p>
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
        <Route path="/sms-opt-in" element={<SmsOptInPage />} />
        <Route path="/" element={<ProtectedRoute><OnboardingGate><AppShell /></OnboardingGate></ProtectedRoute>}>
          <Route index element={<RoleHome />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="assessments" element={<AssessmentsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="export" element={<DataExportPage />} />
          <Route path="headmaster/applications" element={<ApplicationQueuePage />} />
          <Route path="headmaster/interviews" element={<InterviewAvailabilityPage />} />
          <Route path="headmaster/shipments" element={<BookShipmentQueuePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
