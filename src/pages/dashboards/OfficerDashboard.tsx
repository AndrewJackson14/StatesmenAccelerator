import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { SessionRow } from '@/types/database';

export default function OfficerDashboard() {
  const { profile } = useAuth();
  const [pastSessions, setPastSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    // Officers see sessions they've attended
    if (profile?.id) {
      const { data: attended } = await supabase
        .from('session_attendance')
        .select('session_id')
        .eq('user_id', profile.id);

      if (attended && attended.length > 0) {
        const { data: sessions } = await supabase
          .from('sessions')
          .select('*')
          .in('id', attended.map((a) => a.session_id))
          .order('scheduled_at', { ascending: false });
        setPastSessions(sessions ?? []);
      }
    }
    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading…</div></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Welcome, {profile?.name ?? 'Officer'}.</h1>
        <p className="mt-1 text-sm text-slate-400">Session guest and mentor view.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Sessions Attended" value={pastSessions.length} />
        <StatCard label="Role" value="Officer" />
      </div>

      <Section title="Session History">
        {pastSessions.length === 0 ? (
          <EmptyState message="No sessions attended yet. You'll see your session history here after participating." />
        ) : (
          <div className="space-y-2">
            {pastSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">{s.title ?? `Session ${s.session_number}`}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{s.phase} · {fmtDate(s.scheduled_at)}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.status === 'completed' ? 'bg-slate-500/10 text-slate-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{s.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Your Profile">
        <div className="space-y-2 text-sm">
          <Row label="Name" value={profile?.name ?? '—'} />
          <Row label="Bio" value={profile?.bio ?? '—'} />
          <Row label="Location" value={profile?.location ?? '—'} />
        </div>
      </Section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <div className="card"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-2xl font-serif text-brass">{value}</div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>{children}</div>;
}
function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-ink-line py-2 last:border-0"><span className="text-slate-500">{label}</span><span className="text-slate-200">{value}</span></div>;
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
