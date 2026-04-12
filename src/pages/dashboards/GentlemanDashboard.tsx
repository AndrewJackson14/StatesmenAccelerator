import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type {
  LeadershipScoreRow,
  FlagRow,
  ChallengeRow,
  ChallengeCompletionRow,
  SessionRow,
  PersonalProjectRow,
  AssessmentInstanceRow,
} from '@/types/database';

// ── Types ──

interface PulsePoint {
  week: number;
  confidence: number;
  character: number;
  ambition: number;
  connection: number;
  challenge_pct: number;
}

// ── Main Dashboard ──

export default function GentlemanDashboard() {
  const { profile, user } = useAuth();
  const uid = user?.id;

  const [pulse, setPulse] = useState<PulsePoint[]>([]);
  const [leadershipScore, setLeadershipScore] = useState<LeadershipScoreRow | null>(null);
  const [prevScore, setPrevScore] = useState<LeadershipScoreRow | null>(null);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [completions, setCompletions] = useState<ChallengeCompletionRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [peerAvg, setPeerAvg] = useState<number | null>(null);
  const [squadStanding, setSquadStanding] = useState<{ squad_name: string; total_points: number; rank: number } | null>(null);
  const [project, setProject] = useState<PersonalProjectRow | null>(null);
  const [nextSession, setNextSession] = useState<SessionRow | null>(null);
  const [upcomingAssessments, setUpcomingAssessments] = useState<AssessmentInstanceRow[]>([]);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (uid) loadDashboard();
  }, [uid]);

  async function loadDashboard() {
    setLoading(true);
    await Promise.all([
      loadPulse(),
      loadLeadershipScore(),
      loadFlags(),
      loadChallenges(),
      loadPeerRating(),
      loadSquadStanding(),
      loadProject(),
      loadNextSession(),
      loadUpcomingAssessments(),
      loadRecommendation(),
    ]);
    setLoading(false);
  }

  async function loadPulse() {
    const { data } = await supabase
      .from('assessment_responses')
      .select('score, subscores, submitted_at, instance_id')
      .eq('user_id', uid!)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true });

    if (!data || data.length === 0) return;

    const instanceIds = data.map((d) => d.instance_id);
    const { data: instances } = await supabase
      .from('assessment_instances')
      .select('id, template_id')
      .in('id', instanceIds);

    if (!instances) return;

    const templateIds = [...new Set(instances.map((i) => i.template_id))];
    const { data: templates } = await supabase
      .from('assessment_templates')
      .select('id, type')
      .in('id', templateIds)
      .eq('type', 'weekly_pulse');

    if (!templates || templates.length === 0) return;

    const pulseTemplateIds = new Set(templates.map((t) => t.id));
    const pulseInstanceIds = new Set(
      instances.filter((i) => pulseTemplateIds.has(i.template_id)).map((i) => i.id)
    );

    const pulseData = data.filter((d) => pulseInstanceIds.has(d.instance_id));
    const points: PulsePoint[] = pulseData.map((d, i) => {
      const s = (d.subscores as Record<string, number>) ?? {};
      return {
        week: i + 1,
        confidence: s.confidence ?? 0,
        character: s.character ?? 0,
        ambition: s.ambition ?? 0,
        connection: s.connection ?? 0,
        challenge_pct: s.challenge_pct ?? 0,
      };
    });
    setPulse(points);
  }

  async function loadLeadershipScore() {
    const { data } = await supabase
      .from('leadership_scores')
      .select('*')
      .eq('user_id', uid!)
      .order('week', { ascending: false })
      .limit(2);

    if (data && data.length > 0) {
      setLeadershipScore(data[0]);
      if (data.length > 1) setPrevScore(data[1]);
    }
  }

  async function loadFlags() {
    const { data } = await supabase
      .from('flags')
      .select('*')
      .eq('user_id', uid!)
      .in('status', ['open', 'acknowledged'])
      .order('triggered_at', { ascending: false });

    setFlags(data ?? []);
  }

  async function loadChallenges() {
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid!)
      .limit(1)
      .maybeSingle();

    if (!membership) return;

    const { data: challengeData } = await supabase
      .from('challenges')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .order('week', { ascending: true });

    const { data: completionData } = await supabase
      .from('challenge_completions')
      .select('*')
      .eq('user_id', uid!);

    setChallenges(challengeData ?? []);
    setCompletions(completionData ?? []);

    if (challengeData && completionData) {
      const completedIds = new Set(completionData.map((c) => c.challenge_id));
      let s = 0;
      for (let i = challengeData.length - 1; i >= 0; i--) {
        if (completedIds.has(challengeData[i].id)) s++;
        else break;
      }
      setStreak(s);
    }
  }

  async function loadPeerRating() {
    const { data } = await supabase
      .from('peer_ratings')
      .select('rating')
      .eq('ratee_id', uid!);

    if (data && data.length > 0) {
      const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
      setPeerAvg(Math.round(avg * 10) / 10);
    }
  }

  async function loadSquadStanding() {
    const { data: membership } = await supabase
      .from('squad_members')
      .select('squad_id')
      .eq('user_id', uid!)
      .is('removed_at', null)
      .limit(1)
      .maybeSingle();

    if (!membership) return;

    const { data: squad } = await supabase
      .from('squads')
      .select('id, name, cohort_id')
      .eq('id', membership.squad_id)
      .maybeSingle();

    if (!squad) return;

    const { data: cohortSquads } = await supabase
      .from('squads')
      .select('id, name')
      .eq('cohort_id', squad.cohort_id)
      .is('archived_at', null);

    if (!cohortSquads) return;

    const { data: allPoints } = await supabase
      .from('squad_points')
      .select('squad_id, points')
      .in('squad_id', cohortSquads.map((s) => s.id));

    const pointsBySquad: Record<string, number> = {};
    for (const s of cohortSquads) pointsBySquad[s.id] = 0;
    for (const p of allPoints ?? []) {
      pointsBySquad[p.squad_id] = (pointsBySquad[p.squad_id] ?? 0) + p.points;
    }

    const sorted = Object.entries(pointsBySquad).sort((a, b) => b[1] - a[1]);
    const rank = sorted.findIndex(([id]) => id === squad.id) + 1;

    setSquadStanding({
      squad_name: squad.name,
      total_points: pointsBySquad[squad.id] ?? 0,
      rank,
    });
  }

  async function loadProject() {
    const { data } = await supabase
      .from('personal_projects')
      .select('*')
      .eq('user_id', uid!)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setProject(data);
  }

  async function loadNextSession() {
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid!)
      .limit(1)
      .maybeSingle();

    if (!membership) return;

    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    setNextSession(data);
  }

  async function loadUpcomingAssessments() {
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid!)
      .limit(1)
      .maybeSingle();

    if (!membership) return;

    const { data: instances } = await supabase
      .from('assessment_instances')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .eq('status', 'open')
      .order('deadline', { ascending: true });

    if (!instances || instances.length === 0) return;

    const { data: responses } = await supabase
      .from('assessment_responses')
      .select('instance_id')
      .eq('user_id', uid!)
      .not('submitted_at', 'is', null);

    const submittedIds = new Set(responses?.map((r) => r.instance_id) ?? []);
    setUpcomingAssessments(instances.filter((i) => !submittedIds.has(i.id)));
  }

  async function loadRecommendation() {
    const { data } = await supabase
      .from('dose_metrics')
      .select('recommendations')
      .eq('user_id', uid!)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.recommendations) {
      const recs = data.recommendations as string[];
      if (recs.length > 0) setRecommendation(recs[0]);
    }
  }

  // ── Derived ──

  const completionRate =
    challenges.length > 0
      ? Math.round((completions.length / challenges.length) * 100)
      : null;

  const rankDelta =
    leadershipScore && prevScore
      ? (prevScore.rank ?? 0) - (leadershipScore.rank ?? 0)
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500">Loading your dashboard…</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Welcome, {profile?.name ?? 'Gentleman'}.</h1>
        <p className="mt-1 text-sm text-slate-400">Your week at a glance.</p>
      </div>

      {/* Active Flags — top of page, high visibility */}
      {flags.length > 0 && (
        <div className="space-y-2">
          {flags.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 ${
                f.severity === 'red'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-yellow-500/30 bg-yellow-500/5'
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${f.severity === 'red' ? 'bg-red-500' : 'bg-yellow-500'}`} />
              <div className="text-sm text-slate-200">{formatFlagType(f.flag_type)}</div>
              <div className="ml-auto text-xs text-slate-500">{timeAgo(f.triggered_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Leadership Score"
          value={leadershipScore ? leadershipScore.score.toString() : '—'}
          sub={
            leadershipScore?.rank
              ? `Rank #${leadershipScore.rank}${rankDelta ? ` (${rankDelta > 0 ? '↑' : '↓'}${Math.abs(rankDelta)})` : ''}`
              : undefined
          }
          trend={rankDelta !== null ? (rankDelta > 0 ? 'up' : rankDelta < 0 ? 'down' : 'flat') : undefined}
        />
        <StatCard
          label="Challenges"
          value={completionRate !== null ? `${completionRate}%` : '—'}
          sub={streak > 0 ? `${streak} streak` : undefined}
        />
        <StatCard label="Peer Rating" value={peerAvg !== null ? peerAvg.toString() : '—'} sub="Rolling avg" />
        <StatCard
          label="Squad Standing"
          value={squadStanding ? `#${squadStanding.rank}` : '—'}
          sub={squadStanding ? `${squadStanding.squad_name} · ${squadStanding.total_points} pts` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Pulse Trend */}
          <Section title="Weekly Pulse">
            {pulse.length === 0 ? (
              <EmptyState message="Complete your first weekly pulse to see your trend." />
            ) : (
              <div className="space-y-3">
                {['confidence', 'character', 'ambition', 'connection'].map((dim) => (
                  <div key={dim}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs capitalize text-slate-400">{dim}</span>
                      <span className="text-xs text-slate-500">
                        {(pulse[pulse.length - 1] as unknown as Record<string, number>)[dim]}/5
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {pulse.map((p, i) => {
                        const val = (p as unknown as Record<string, number>)[dim];
                        return (
                          <div key={i} className="flex-1" title={`Week ${p.week}: ${val}`}>
                            <div
                              className={`rounded-sm transition-all ${pulseColor(val)}`}
                              style={{ height: `${Math.max(val * 6, 4)}px` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Challenge Progress */}
          <Section title="Challenge Completion">
            {challenges.length === 0 ? (
              <EmptyState message="No challenges assigned yet." />
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{completions.length} of {challenges.length} complete</span>
                  <span>{completionRate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-line">
                  <div className="h-full rounded-full bg-brass transition-all" style={{ width: `${completionRate ?? 0}%` }} />
                </div>
                {streak > 0 && <div className="mt-2 text-xs text-brass">{streak} challenge streak</div>}
              </div>
            )}
          </Section>

          {/* Personal Project */}
          <Section title="Personal Project">
            {!project ? (
              <EmptyState message="No project started yet. Your capstone project will appear here." />
            ) : (
              <div>
                <div className="text-sm font-medium text-slate-100">{project.title}</div>
                {project.description && <div className="mt-1 text-xs text-slate-400">{project.description}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <ProjectStatusBadge status={project.status ?? 'planning'} />
                  {project.milestones && (
                    <span className="text-xs text-slate-500">
                      {Array.isArray(project.milestones) ? project.milestones.length : 0} milestones
                    </span>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <Section title="Next Session">
            {!nextSession ? (
              <EmptyState message="No upcoming sessions." />
            ) : (
              <div>
                <div className="text-sm font-medium text-slate-100">
                  {nextSession.title ?? `Session ${nextSession.session_number}`}
                </div>
                <div className="mt-1 text-xs text-slate-400">{formatSessionDate(nextSession.scheduled_at)}</div>
                <div className="mt-2 text-xs text-brass">{countdownText(nextSession.scheduled_at)}</div>
                {nextSession.webex_link && (
                  <a href={nextSession.webex_link} target="_blank" rel="noopener noreferrer" className="btn mt-3 w-full text-center text-xs">
                    Join Session
                  </a>
                )}
              </div>
            )}
          </Section>

          <Section title="Upcoming Assessments">
            {upcomingAssessments.length === 0 ? (
              <EmptyState message="All caught up." />
            ) : (
              <div className="space-y-2">
                {upcomingAssessments.map((a) => (
                  <div key={a.id} className="rounded-md border border-ink-line bg-ink px-3 py-2">
                    <div className="text-xs text-slate-300">Assessment</div>
                    {a.deadline && <div className="mt-0.5 text-xs text-slate-500">Due {formatSessionDate(a.deadline)}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {recommendation && (
            <Section title="Recommended">
              <div className="text-sm text-slate-300">{recommendation}</div>
            </Section>
          )}

          {leadershipScore?.components && (
            <Section title="Score Breakdown">
              <div className="space-y-2">
                {Object.entries(leadershipScore.components as Record<string, number>).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs capitalize text-slate-400">{key.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-300">{value}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'flat' }) {
  const empty = value === '—';
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-serif ${empty ? 'text-slate-600' : 'text-brass'}`}>
        {value}
        {trend === 'up' && <span className="ml-1 text-sm text-emerald-400">↑</span>}
        {trend === 'down' && <span className="ml-1 text-sm text-red-400">↓</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}

function ProjectStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planning: 'bg-blue-500/10 text-blue-400',
    in_progress: 'bg-brass/10 text-brass',
    submitted: 'bg-emerald-500/10 text-emerald-400',
    evaluated: 'bg-slate-500/10 text-slate-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? colors.planning}`}>{status.replace(/_/g, ' ')}</span>;
}

// ── Helpers ──

function pulseColor(val: number): string {
  if (val >= 4) return 'bg-emerald-500';
  if (val >= 3) return 'bg-brass';
  if (val >= 2) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatFlagType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function countdownText(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Starting now';
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return `${Math.floor(diff / 60000)}m away`;
  if (hrs < 24) return `${hrs}h away`;
  return `${Math.floor(hrs / 24)}d away`;
}
