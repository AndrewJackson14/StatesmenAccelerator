import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import type { Role } from '@/types/database';

interface Props {
  children: ReactNode;
  allow?: Role[];
}

export default function ProtectedRoute({ children, allow }: Props) {
  const { session, role, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-slate-400">
        <div className="text-sm">Loading…</div>
        <button className="btn text-xs" onClick={() => signOut()}>
          Having trouble? Sign out
        </button>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (allow && role && !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
