import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './SignInPage';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/sign-in`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthLayout title="Reset password">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Reset link sent. Check your email.
          </p>
          <Link to="/sign-in" className="btn-primary block text-center">
            Back to sign in
          </Link>
        </div>
      ) : (
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
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <div className="text-center text-xs text-slate-400">
            <Link to="/sign-in" className="hover:text-brass">
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
