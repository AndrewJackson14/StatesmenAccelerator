import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import NotificationsDropdown from '@/components/NotificationsDropdown';
import type { Role } from '@/types/database';

interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', roles: ['gentleman', 'captain', 'headmaster', 'officer', 'alumni'] },
  { to: '/sessions', label: 'Sessions', roles: ['gentleman', 'captain', 'headmaster'] },
  { to: '/assessments', label: 'Assessments', roles: ['gentleman', 'captain', 'headmaster'] },
  { to: '/leaderboard', label: 'Leaderboard', roles: ['gentleman', 'captain', 'headmaster'] },
  { to: '/messages', label: 'Messages', roles: ['gentleman', 'captain', 'headmaster', 'officer'] },
  { to: '/headmaster/applications', label: 'Applications', roles: ['headmaster'] },
  { to: '/headmaster/interviews', label: 'Interviews', roles: ['headmaster'] },
  { to: '/payment', label: 'Payment', roles: ['gentleman'] },
  { to: '/export', label: 'Export', roles: ['headmaster'] },
  { to: '/profile', label: 'Profile', roles: ['gentleman', 'captain', 'headmaster', 'officer', 'alumni'] },
];

const ROLE_LABEL: Record<Role, string> = {
  gentleman: 'Gentleman',
  captain: 'Captain',
  headmaster: 'Headmaster',
  officer: 'Officer',
  alumni: 'Alumni',
};

export default function AppShell() {
  const { profile, role, signOut } = useAuth();
  const visible = role ? NAV.filter((n) => n.roles.includes(role)) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-line bg-ink-soft">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="font-serif text-2xl text-brass">Statesmen Accelerator</span>
          </Link>
          <nav className="flex items-center gap-4 overflow-x-auto">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `whitespace-nowrap text-sm font-medium transition ${isActive ? 'text-brass' : 'text-slate-300 hover:text-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <NotificationsDropdown />
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium text-slate-100">{profile?.name ?? 'Unnamed'}</div>
              <div className="text-slate-500">{role ? ROLE_LABEL[role] : '—'}</div>
            </div>
            <button onClick={signOut} className="btn">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-ink-line py-4 text-center text-xs text-slate-500">
        Confidence • Character • Ambition
      </footer>
    </div>
  );
}
