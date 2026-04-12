import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AuthLayout } from './SignInPage';

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signUp(email, password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/');
  };

  return (
    <AuthLayout title="Create account">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <div className="text-center text-xs text-slate-400">
          <Link to="/sign-in" className="hover:text-brass">
            Already have an account? Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
