import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import CoachObservationModal from '@/components/CoachObservationModal';
import type { FlagRow, ProfileRow, CoachObservationRow, SquadRow, SquadMemberRow, SessionRow, CheckinLogRow } from '@/types/database';

interface FlagWithProfile extends FlagRow { profiles: Pick<ProfileRow, 'name' | 'photo_url'> | null; }
interface SquadOverview { squad: SquadRow; members: (SquadMemberRow & { profiles: Pick<ProfileRow, 'name' | 'photo_url'> | null })[]; flag_count: number; }
interface GentlemanQuickView { id: string; name: string; flag_count: number; attendance_pct: number | null; }

export default function CaptainDashboard() {
  const { profile, user } = useAuth();
  const uid = user?.id;

  const [squads, setSquads] = useState<SquadOverview[]>([]);
  const [flags, setFlags] = useState<FlagWithProfile[]>([]);
  const [recentObs, setRecentObs] = useState<CoachObservationRow[]>([]);
  const [pendingObsCount, setPendingObsCount] = useState(0);
  const [gentlemen, setGentlemen] = useState<GentlemanQuickView[]>([]);
  const [checkins, setCheckins] = useState<CheckinLogRow[]>([]);
  const [nextSession, setNextSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showObservation, setShowObservation] = useState(false);

  useEffect(() => { if (uid) loadDashboard(); }, [uid]);

  async function loadDashboard() {
    setLoading(true);
    await Promise.all([loadSquads(), loadFlags(), loadObservations(), loadGentlemen(), loadCheckins(), loadNextSession()]);
    setLoading(false);
  }

  async function loadSquads() {
    const { data: myMemberships } = await supabase.from('squad_members').select('squad_id').eq('user_id', uid!).is('removed_at', null);
    if (!myMemberships || myMemberships.length === 0) { setSquads([]); return; }
    const squadIds = myMemberships.map((m) => m.squad_id);
    const { data: squadData } = await supabase.from('squads').select('*').in('id', squadIds).is('archived_at', null);
    if (!squadData) { setSquads([]); return; }
    const { data: memberData } = await supabase.from('squad_members').select('*, profiles!squad_members_user_id_fkey(name, photo_url)').in('squad_id', squadIds).is('removed_at', null);
    const { data: flagData } = await supabase.from('flags').select('user_id').in('status', ['open', 'acknowledged']);
    const flagsByUser: Record<string, number> = {};
    for (const f of flagData ?? []) flagsByUser[f.user_id] = (flagsByUser[f.user_id] ?? 0) + 1;
    setSquads(squadData.map((sq) => {
      const members = (memberData ?? []).filter((m) => m.squad_id === sq.id);
      const fCount = members.reduce((sum, m) => sum + (flagsByUser[m.user_id] ?? 0), 0);
      return { squad: sq, members: members as SquadOverview['members'], flag_count: fCount };
    }));
  }

  async function loadFlags() {
    const { data } = await supabase.from('flags').select('*, profiles!flags_user_id_fkey(name, photo_url)').in('status', ['open', 'acknowledged']).order('triggered_at', { ascending: false }).limit(20);
    setFlags((data as FlagWithProfile[]) ?? []);
  }

  async function loadObservations() {
    const { data: recent } = await supabase.from('coach_observations').select('*').eq('captain_id', uid!).order('created_at', { ascending: false }).limit(5);
    setRecentObs(recent ?? []);
    const { data: membership } = await supabase.from('cohort_members').select('cohort_id').eq('user_id', uid!).limit(1).maybeSingle();
    if (!membership) { setPendingObsCount(0); return; }
    const { data: pastSessions } = await supabase.from('sessions').select('id').eq('cohort_id', membership.cohort_id).eq('status', 'completed');
    if (!pastSessions || pastSessions.length === 0) { setPendingObsCount(0); return; }
    const { data: myObs } = await supabase.from('coach_observations').select('session_id').eq('captain_id', uid!).in('session_id', pastSessions.map((s) => s.id));
    const done = new Set(myObs?.map((o) => o.session_id) ?? []);
    setPendingObsCount(pastSessions.filter((s) => !done.has(s.id)).length);
  }

  async function loadGentlemen() {
    const { data: profiles } = await supabase.from('profiles').select('id, name, photo_url').eq('role', 'gentleman').order('name');
    if (!profiles || profiles.length === 0) { setGentlemen([]); return; }
    const userIds = profiles.map((p) => p.id);
    const { data: flagData } = await supabase.from('flags').select('user_id').in('user_id', userIds).in('status', ['open', 'acknowledged']);
    const flagsByUser: Record<string, number> = {};
    for (const f of flagData ?? []) flagsByUser[f.user_id] = (flagsByUser[f.user_id] ?? 0) + 1;
    const { data: attData } = await supabase.from('session_attendance').select('user_id, status').in('user_id', userIds);
    const attByUser: Record<string, { total: number; present: number }> = {};
    for (const a of attData ?? []) { if (!attByUser[a.user_id]) attByUser[a.user_id] = { total: 0, present: 0 }; attByUser[a.user_id].total++; if (a.status === 'present' || a.status === 'late') attByUser[a.user_id].present++; }
    const views: GentlemanQuickView[] = profiles.map((p) => ({
      id: p.id, name: p.name ?? 'Unnamed', flag_count: flagsByUser[p.id] ?? 0,
      attendance_pct: attByUser[p.id] ? Math.round((attByUser[p.id].present / attByUser[p.id].total) * 100) : null,
    }));
    views.sort((a, b) => b.flag_count !== a.flag_count ? b.flag_count - a.flag_count : a.name.localeCompare(b.name));
    setGentlemen(views);
  }

  async function loadCheckins() {
    const { data } = await supabase.from('checkin_log').select('*').eq('captain_id', uid!).order('checked_in_at', { ascending: false }).limit(5);
    setCheckins(data ?? []);
  }

  async function loadNextSession() {
    const { data: membership } = await supabase.from('cohort_members').select('cohort_id').eq('user_id', uid!).limit(1).maybeSingle();
    if (!membership) return;
    const { data } = await supabase.from('sessions').select('*').eq('cohort_id', membership.cohort_id).gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }).limit(1).maybeSingle();
    setNextSession(data);
  }

  const atRisk = gentlemen.filter((g) => g.flag_count > 0);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading captain's view…</div></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Captain's Deck</h1>
          <p className="mt-1 text-sm text-slate-400">{profile?.name ? `${profile.name} — ` : ''}Squad management and observations.</p>
        </div>
        <button className="btn-primary text-xs" onClick={() => setShowObservation(true)}>+ Observation</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Squads" value={squads.length} empty={squads.length === 0} />
        <StatCard label="Open Flags" value={flags.length} alert={flags.some((f) => f.severity === 'red')} empty={flags.length === 0} />
        <StatCard label="Pending Observations" value={pendingObsCount} alert={pendingObsCount > 0} empty={pendingObsCount === 0} />
        <StatCard label="At-Risk" value={atRisk.length} alert={atRisk.length > 0} empty={atRisk.length === 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Assigned Squads">
            {squads.length === 0 ? <EmptyState message="No squads assigned yet." /> : (
              <div className="space-y-4">{squads.map((sq) => (
                <div key={sq.squad.id} className="rounded-md border border-ink-line bg-ink p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-100">{sq.squad.name}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{sq.members.length} members</span>
                      {sq.flag_count > 0 && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">{sq.flag_count} flag{sq.flag_count !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">{sq.members.map((m) => (
                    <span key={m.user_id} className="rounded-full bg-ink-soft px-2 py-0.5 text-xs text-slate-400">
                      {m.profiles?.name ?? 'Unnamed'}{m.role !== 'member' && <span className="ml-1 text-brass">{m.role === 'leader' ? '★' : '◆'}</span>}
                    </span>
                  ))}</div>
                </div>
              ))}</div>
            )}
          </Section>

          <Section title="Flag Queue">
            {flags.length === 0 ? <EmptyState message="No open flags. All clear." /> : (
              <div className="space-y-2">{flags.slice(0, 10).map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${f.severity === 'red' ? 'bg-red-500' : f.severity === 'positive' ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                    <div><div className="text-sm text-slate-100">{f.profiles?.name ?? 'Unknown'} <span className="text-slate-500">·</span> <span className="text-slate-400">{fmtFlag(f.flag_type)}</span></div><div className="text-xs text-slate-500">{timeAgo(f.triggered_at)}</div></div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.severity === 'red' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{f.severity}</span>
                </div>
              ))}</div>
            )}
          </Section>

          <Section title="Gentlemen">
            {gentlemen.length === 0 ? <EmptyState message="No gentlemen enrolled yet." /> : (
              <div className="space-y-1">{gentlemen.slice(0, 15).map((g) => (
                <div key={g.id} className="flex items-center justify-between border-b border-ink-line py-2 last:border-0">
                  <div className="flex items-center gap-2">{g.flag_count > 0 && <div className="h-1.5 w-1.5 rounded-full bg-red-500" />}<span className="text-sm text-slate-200">{g.name}</span></div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">{g.attendance_pct !== null && <span>{g.attendance_pct}% att</span>}{g.flag_count > 0 && <span className="text-red-400">{g.flag_count} flag{g.flag_count !== 1 ? 's' : ''}</span>}</div>
                </div>
              ))}</div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Next Session">
            {!nextSession ? <EmptyState message="No upcoming sessions." /> : (
              <div>
                <div className="text-sm font-medium text-slate-100">{nextSession.title ?? `Session ${nextSession.session_number}`}</div>
                <div className="mt-1 text-xs text-slate-400">{fmtDate(nextSession.scheduled_at)}</div>
                <div className="mt-2 text-xs text-brass">{countdown(nextSession.scheduled_at)}</div>
              </div>
            )}
          </Section>

          <Section title="Recent Observations">
            {recentObs.length === 0 ? <EmptyState message="No observations submitted yet." /> : (
              <div className="space-y-2">{recentObs.map((o) => (
                <div key={o.id} className="rounded-md border border-ink-line bg-ink px-3 py-2">
                  <div className="flex items-center justify-between"><span className="text-xs text-slate-300">{o.engagement}{o.participation && ` · ${o.participation}`}</span>{o.approved_at && <span className="text-xs text-emerald-500">✓</span>}</div>
                  <div className="mt-1 text-xs text-slate-500">{timeAgo(o.created_at)}</div>
                </div>
              ))}</div>
            )}
          </Section>

          <Section title="Recent Check-ins">
            {checkins.length === 0 ? <EmptyState message="No check-ins logged yet." /> : (
              <div className="space-y-2">{checkins.map((c) => (
                <div key={c.id} className="border-b border-ink-line py-2 last:border-0">
                  <div className="text-xs text-slate-300">{c.notes ? c.notes.slice(0, 60) + (c.notes.length > 60 ? '…' : '') : 'No notes'}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{timeAgo(c.checked_in_at)}</div>
                </div>
              ))}</div>
            )}
          </Section>
        </div>
      </div>

      <CoachObservationModal open={showObservation} onClose={() => setShowObservation(false)} onSubmitted={loadDashboard} />
    </div>
  );
}

function StatCard({ label, value, alert, empty }: { label: string; value: number; alert?: boolean; empty?: boolean }) {
  return <div className="card"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-1 text-2xl font-serif ${alert ? 'text-red-400' : empty ? 'text-slate-600' : 'text-brass'}`}>{value}</div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>{children}</div>;
}
function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}
function fmtFlag(t: string) { return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function timeAgo(iso: string) { const d = Date.now() - new Date(iso).getTime(); const m = Math.floor(d / 60000); if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d ago`; return new Date(iso).toLocaleDateString(); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function countdown(iso: string) { const d = new Date(iso).getTime() - Date.now(); if (d <= 0) return 'Starting now'; const h = Math.floor(d / 3600000); if (h < 1) return `${Math.floor(d / 60000)}m away`; if (h < 24) return `${h}h away`; return `${Math.floor(h / 24)}d away`; }
