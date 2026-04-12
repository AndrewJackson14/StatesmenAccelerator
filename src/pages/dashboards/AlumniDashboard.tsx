import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { ConfirmationStandingRow, AlumniAccomplishmentRow } from '@/types/database';

interface AlumniProfile {
  id: string;
  name: string;
  photo_url: string | null;
  location: string | null;
  confirmation_standing: string | null;
}

export default function AlumniDashboard() {
  const { profile, user } = useAuth();
  const uid = user?.id;

  const [standing, setStanding] = useState<ConfirmationStandingRow | null>(null);
  const [accomplishments, setAccomplishments] = useState<AlumniAccomplishmentRow[]>([]);
  const [directory, setDirectory] = useState<AlumniProfile[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (uid) loadDashboard(); }, [uid]);

  async function loadDashboard() {
    setLoading(true);
    await Promise.all([loadStanding(), loadAccomplishments(), loadDirectory()]);
    setLoading(false);
  }

  async function loadStanding() {
    const { data } = await supabase
      .from('confirmation_standings')
      .select('*')
      .eq('user_id', uid!)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setStanding(data);
  }

  async function loadAccomplishments() {
    const { data } = await supabase
      .from('alumni_accomplishments')
      .select('*')
      .eq('user_id', uid!)
      .order('created_at', { ascending: false });
    setAccomplishments(data ?? []);
  }

  async function loadDirectory() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, photo_url, location, confirmation_standing')
      .eq('role', 'alumni')
      .order('name');
    setDirectory((data as AlumniProfile[]) ?? []);
  }

  async function addAccomplishment() {
    if (!newTitle.trim()) return;
    setAdding(true);
    await supabase.from('alumni_accomplishments').insert({
      user_id: uid!,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
    });
    setNewTitle('');
    setNewDesc('');
    setShowForm(false);
    setAdding(false);
    loadAccomplishments();
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading…</div></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Welcome back, {profile?.name ?? 'Alumni'}.</h1>
        <p className="mt-1 text-sm text-slate-400">Your journey continues.</p>
      </div>

      {/* Standing + Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Standing" value={standing ? fmtStanding(standing.standing) : '—'} />
        <StatCard label="Score" value={standing?.total_score ? `${standing.total_score}` : '—'} />
        <StatCard label="Accomplishments" value={accomplishments.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Accomplishments */}
          <Section title="Post-Program Accomplishments" action={!showForm ? <button className="text-xs text-brass hover:text-brass-dim" onClick={() => setShowForm(true)}>+ Add</button> : undefined}>
            {showForm && (
              <div className="mb-4 space-y-2 rounded-md border border-ink-line bg-ink p-3">
                <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Accomplishment title" autoFocus />
                <textarea className="input min-h-[60px] resize-y" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" />
                <div className="flex justify-end gap-2">
                  <button className="btn text-xs" onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="btn-primary text-xs" onClick={addAccomplishment} disabled={adding || !newTitle.trim()}>{adding ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            )}
            {accomplishments.length === 0 && !showForm ? (
              <EmptyState message="No accomplishments added yet. Share what you've achieved since the program." />
            ) : (
              <div className="space-y-2">
                {accomplishments.map((a) => (
                  <div key={a.id} className="rounded-md border border-ink-line bg-ink px-4 py-3">
                    <div className="text-sm font-medium text-slate-100">{a.title}</div>
                    {a.description && <div className="mt-1 text-xs text-slate-400">{a.description}</div>}
                    <div className="mt-1 text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Confirmation Breakdown */}
          {standing && (
            <Section title="Confirmation Breakdown">
              <div className="space-y-2">
                <ScoreRow label="Challenge Completion" value={standing.challenge_completion} max={20} />
                <ScoreRow label="Self-Assessment Trajectory" value={standing.self_assessment_trajectory} max={15} />
                <ScoreRow label="Peer 360 Average" value={standing.peer_360_average} max={15} />
                <ScoreRow label="Leadership Performance" value={standing.leadership_performance} max={15} />
                <ScoreRow label="Resolve/Efficacy Growth" value={standing.resolve_efficacy_growth} max={15} />
                <ScoreRow label="Capstone Quality" value={standing.capstone_quality} max={10} />
                <ScoreRow label="Coach Evaluation" value={standing.coach_evaluation} max={10} />
              </div>
            </Section>
          )}
        </div>

        {/* Directory sidebar */}
        <div className="space-y-6">
          <Section title={`Alumni Directory (${directory.length})`}>
            {directory.length === 0 ? (
              <EmptyState message="No alumni yet." />
            ) : (
              <div className="space-y-1">
                {directory.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border-b border-ink-line py-2 last:border-0">
                    <div>
                      <div className="text-sm text-slate-200">{a.name ?? 'Unnamed'}</div>
                      {a.location && <div className="text-xs text-slate-500">{a.location}</div>}
                    </div>
                    {a.confirmation_standing && (
                      <span className="text-xs text-slate-500">{fmtStandingShort(a.confirmation_standing)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  const empty = value === '—' || value === 0;
  return <div className="card"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-1 text-2xl font-serif ${empty ? 'text-slate-600' : 'text-brass'}`}>{value}</div></div>;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}

function ScoreRow({ label, value, max }: { label: string; value: number | null; max: number }) {
  const pct = value !== null ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">{value !== null ? `${value}/${max}` : '—'}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-line">
        <div className="h-full rounded-full bg-brass transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtStanding(s: string) {
  return { confirmed_distinction: 'Confirmed w/ Distinction', confirmed: 'Confirmed', confirmed_conditions: 'Confirmed w/ Conditions', provisional: 'Provisional', non_confirmed: 'Non-Confirmed', pending: 'Pending' }[s] ?? s;
}

function fmtStandingShort(s: string) {
  return { confirmed_distinction: 'Distinction', confirmed: 'Confirmed', confirmed_conditions: 'Conditional', provisional: 'Provisional', non_confirmed: 'Non-Conf.', pending: 'Pending' }[s] ?? s;
}
