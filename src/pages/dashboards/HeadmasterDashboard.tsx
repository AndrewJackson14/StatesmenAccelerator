import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import CreateCohortModal from '@/components/CreateCohortModal';
import EnrollGentlemanModal from '@/components/EnrollGentlemanModal';
import CreateSquadModal from '@/components/CreateSquadModal';
import type {
  CohortRow,
  FlagRow,
  ProfileRow,
  CoachObservationRow,
  AuditLogRow,
  ConfirmationStandingRow,
} from '@/types/database';

interface CohortSummary extends CohortRow { member_count: number; flag_count: number; }
interface FlagWithProfile extends FlagRow { profiles: Pick<ProfileRow, 'name' | 'photo_url'> | null; }
interface ObservationWithProfile extends CoachObservationRow { profiles: Pick<ProfileRow, 'name'> | null; }

export default function HeadmasterDashboard() {
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [flags, setFlags] = useState<FlagWithProfile[]>([]);
  const [observations, setObservations] = useState<ObservationWithProfile[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogRow[]>([]);
  const [standings, setStandings] = useState<ConfirmationStandingRow[]>([]);
  const [gentlemenCount, setGentlemenCount] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [challengeRate, setChallengeRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateCohort, setShowCreateCohort] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showCreateSquad, setShowCreateSquad] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    await Promise.all([loadCohorts(), loadFlags(), loadObservations(), loadAudit(), loadStandings(), loadSystemHealth()]);
    setLoading(false);
  }

  async function loadCohorts() {
    const { data: cohortData } = await supabase.from('cohorts').select('*').order('created_at', { ascending: false });
    if (!cohortData) { setCohorts([]); return; }
    const { data: members } = await supabase.from('cohort_members').select('cohort_id, user_id');
    const { data: flagData } = await supabase.from('flags').select('cohort_id').in('status', ['open', 'acknowledged']);
    setCohorts(cohortData.map((c) => ({ ...c, member_count: members?.filter((m) => m.cohort_id === c.id).length ?? 0, flag_count: flagData?.filter((f) => f.cohort_id === c.id).length ?? 0 })));
  }

  async function loadFlags() {
    const { data } = await supabase.from('flags').select('*, profiles!flags_user_id_fkey(name, photo_url)').in('status', ['open', 'acknowledged']).order('triggered_at', { ascending: false }).limit(20);
    setFlags((data as FlagWithProfile[]) ?? []);
  }

  async function loadObservations() {
    const { data } = await supabase.from('coach_observations').select('*, profiles!coach_observations_captain_id_fkey(name)').order('created_at', { ascending: false }).limit(10);
    setObservations((data as ObservationWithProfile[]) ?? []);
  }

  async function loadAudit() {
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(15);
    setAuditEntries(data ?? []);
  }

  async function loadStandings() {
    const { data } = await supabase.from('confirmation_standings').select('*').order('calculated_at', { ascending: false });
    setStandings(data ?? []);
  }

  async function loadSystemHealth() {
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'gentleman');
    setGentlemenCount(count ?? 0);
    const { data: attData } = await supabase.from('session_attendance').select('status');
    if (attData && attData.length > 0) {
      const present = attData.filter((a) => a.status === 'present' || a.status === 'late').length;
      setAttendanceRate(Math.round((present / attData.length) * 100));
    }
    const { count: tc } = await supabase.from('challenges').select('id', { count: 'exact', head: true });
    const { count: cc } = await supabase.from('challenge_completions').select('challenge_id', { count: 'exact', head: true });
    if (tc && tc > 0 && cc !== null) setChallengeRate(Math.round((cc / (tc * (gentlemenCount || 1))) * 100));
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading command center…</div></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Command Center</h1>
          <p className="mt-1 text-sm text-slate-400">Program health across all cohorts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-xs" onClick={() => setShowCreateCohort(true)}>+ Cohort</button>
          <button className="btn text-xs" onClick={() => setShowEnroll(true)}>+ Enroll</button>
          <button className="btn text-xs" onClick={() => setShowCreateSquad(true)}>+ Squad</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Gentlemen" value={gentlemenCount} empty={gentlemenCount === 0} to="/headmaster/applications?tab=all" />
        <StatCard label="Open Flags" value={flags.length} alert={flags.some((f) => f.severity === 'red')} empty={flags.length === 0} />
        <StatCard label="Attendance" value={attendanceRate !== null ? `${attendanceRate}%` : '—'} empty={attendanceRate === null} />
        <StatCard label="Challenge Completion" value={challengeRate !== null ? `${challengeRate}%` : '—'} empty={challengeRate === null} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Cohorts">
            {cohorts.length === 0 ? <EmptyState message='No cohorts yet. Hit "+ Cohort" to start.' /> : (
              <div className="space-y-2">{cohorts.map((c) => (
                <Link
                  key={c.id}
                  to={c.name === 'Intake Pool' ? '/headmaster/applications' : `/headmaster/applications?cohort=${c.id}`}
                  className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3 transition hover:border-brass/50 hover:bg-ink-soft"
                >
                  <div><div className="text-sm font-medium text-slate-100">{c.name}</div><div className="mt-0.5 text-xs text-slate-500">{c.member_count} members · {c.current_phase ?? 'Not started'}</div></div>
                  <div className="flex items-center gap-3">{c.flag_count > 0 && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">{c.flag_count} flag{c.flag_count !== 1 ? 's' : ''}</span>}<StatusBadge status={c.status} /></div>
                </Link>
              ))}</div>
            )}
          </Section>

          <Section title="Flag Queue">
            {flags.length === 0 ? <EmptyState message="No open flags. All clear." /> : (
              <div className="space-y-2">{flags.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                  <div className="flex items-center gap-3"><SeverityDot severity={f.severity} /><div><div className="text-sm text-slate-100">{f.profiles?.name ?? 'Unknown'} <span className="text-slate-500">·</span> <span className="text-slate-400">{fmtFlag(f.flag_type)}</span></div><div className="text-xs text-slate-500">{timeAgo(f.triggered_at)}{f.status === 'acknowledged' && ' · Acknowledged'}</div></div></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.severity === 'red' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{f.severity}</span>
                </div>
              ))}</div>
            )}
          </Section>

          <Section title="Confirmation Projections">
            {standings.length === 0 ? <EmptyState message="Standings populate after Week 13." /> : (
              <div className="grid gap-3 sm:grid-cols-2">{groupStandings(standings).map(([s, n]) => (
                <div key={s} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3"><span className="text-sm text-slate-300">{fmtStanding(s)}</span><span className="text-sm font-medium text-brass">{n}</span></div>
              ))}</div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Captain Activity">
            {observations.length === 0 ? <EmptyState message="No observations yet." /> : (
              <div className="space-y-2">{observations.map((o) => (
                <div key={o.id} className="rounded-md border border-ink-line bg-ink px-3 py-2">
                  <div className="text-xs font-medium text-slate-300">{o.profiles?.name ?? 'Captain'}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{o.engagement}{o.participation && ` · ${o.participation}`}</div>
                  <div className="mt-1 text-xs text-slate-500">{timeAgo(o.created_at)}</div>
                </div>
              ))}</div>
            )}
          </Section>

          <Section title="Recent Activity">
            {auditEntries.length === 0 ? <EmptyState message="No activity yet." /> : (
              <div className="space-y-1">{auditEntries.map((a) => (
                <div key={a.id} className="border-b border-ink-line py-2 last:border-0">
                  <div className="text-xs text-slate-300">{a.action.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-500">{a.entity_type && `${a.entity_type} · `}{timeAgo(a.created_at)}</div>
                </div>
              ))}</div>
            )}
          </Section>
        </div>
      </div>

      <CreateCohortModal open={showCreateCohort} onClose={() => setShowCreateCohort(false)} onCreated={loadDashboard} />
      <EnrollGentlemanModal open={showEnroll} onClose={() => setShowEnroll(false)} onEnrolled={loadDashboard} />
      <CreateSquadModal open={showCreateSquad} onClose={() => setShowCreateSquad(false)} onCreated={loadDashboard} />
    </div>
  );
}

function StatCard({ label, value, alert, empty, to }: { label: string; value: string | number; alert?: boolean; empty?: boolean; to?: string }) {
  const content = (
    <>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-serif ${alert ? 'text-red-400' : empty ? 'text-slate-600' : 'text-brass'}`}>{value}</div>
    </>
  );
  if (to) {
    return <Link to={to} className="card block transition hover:border-brass/50 hover:bg-ink-soft">{content}</Link>;
  }
  return <div className="card">{content}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>{children}</div>;
}
function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}
function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = { active: 'bg-emerald-500/10 text-emerald-400', upcoming: 'bg-blue-500/10 text-blue-400', completed: 'bg-slate-500/10 text-slate-400', archived: 'bg-slate-500/10 text-slate-600' };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c[status] ?? c.archived}`}>{status}</span>;
}
function SeverityDot({ severity }: { severity: string }) {
  return <div className={`h-2 w-2 rounded-full ${severity === 'red' ? 'bg-red-500' : severity === 'positive' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />;
}
function fmtFlag(t: string) { return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function fmtStanding(s: string) { return { confirmed_distinction: 'Confirmed w/ Distinction', confirmed: 'Confirmed', confirmed_conditions: 'Confirmed w/ Conditions', provisional: 'Provisional', non_confirmed: 'Non-Confirmed', pending: 'Pending' }[s] ?? s; }
function groupStandings(data: ConfirmationStandingRow[]): [string, number][] {
  const c: Record<string, number> = {}; for (const s of data) c[s.standing] = (c[s.standing] ?? 0) + 1;
  return ['confirmed_distinction', 'confirmed', 'confirmed_conditions', 'provisional', 'non_confirmed', 'pending'].filter((k) => c[k]).map((k) => [k, c[k]]);
}
function timeAgo(iso: string) { const d = Date.now() - new Date(iso).getTime(); const m = Math.floor(d / 60000); if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d ago`; return new Date(iso).toLocaleDateString(); }
