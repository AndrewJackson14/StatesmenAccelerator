import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

interface LeaderEntry {
  user_id: string;
  name: string;
  score: number;
  rank: number;
  prev_rank: number | null;
}

interface SquadEntry {
  squad_id: string;
  name: string;
  total_points: number;
  rank: number;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const uid = user?.id;

  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [squads, setSquads] = useState<SquadEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (uid) loadLeaderboard(); }, [uid]);

  async function loadLeaderboard() {
    setLoading(true);

    // Get user's cohort
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid!)
      .limit(1)
      .maybeSingle();

    if (!membership) { setLoading(false); return; }

    // Leadership scores - latest week
    const { data: scores } = await supabase
      .from('leadership_scores')
      .select('user_id, week, score, rank')
      .eq('cohort_id', membership.cohort_id)
      .order('week', { ascending: false });

    if (scores && scores.length > 0) {
      const latestWeek = scores[0].week;
      const prevWeek = latestWeek - 1;

      const current = scores.filter((s) => s.week === latestWeek);
      const previous = scores.filter((s) => s.week === prevWeek);
      const prevMap = new Map(previous.map((s) => [s.user_id, s.rank]));

      const userIds = current.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);

      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.name ?? 'Unnamed']));

      const entries: LeaderEntry[] = current
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
        .slice(0, 10)
        .map((s) => ({
          user_id: s.user_id,
          name: nameMap.get(s.user_id) ?? 'Unnamed',
          score: s.score,
          rank: s.rank ?? 0,
          prev_rank: prevMap.get(s.user_id) ?? null,
        }));

      setLeaders(entries);
    }

    // Squad standings
    const { data: cohortSquads } = await supabase
      .from('squads')
      .select('id, name')
      .eq('cohort_id', membership.cohort_id)
      .is('archived_at', null);

    if (cohortSquads && cohortSquads.length > 0) {
      const { data: points } = await supabase
        .from('squad_points')
        .select('squad_id, points')
        .in('squad_id', cohortSquads.map((s) => s.id));

      const pointsBySquad: Record<string, number> = {};
      for (const s of cohortSquads) pointsBySquad[s.id] = 0;
      for (const p of points ?? []) pointsBySquad[p.squad_id] = (pointsBySquad[p.squad_id] ?? 0) + p.points;

      const sorted = cohortSquads
        .map((s) => ({ squad_id: s.id, name: s.name, total_points: pointsBySquad[s.id] ?? 0 }))
        .sort((a, b) => b.total_points - a.total_points)
        .map((s, i) => ({ ...s, rank: i + 1 }));

      setSquads(sorted);
    }

    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading leaderboard…</div></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-400">Updated weekly. Top 10 individuals and all squad standings.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Individual */}
        <Section title="Leadership Score — Top 10">
          {leaders.length === 0 ? (
            <EmptyState message="Scores haven't been calculated yet. Check back after your first week." />
          ) : (
            <div className="space-y-1">
              {leaders.map((l) => {
                const delta = l.prev_rank !== null ? l.prev_rank - l.rank : null;
                const isMe = l.user_id === uid;
                return (
                  <div key={l.user_id} className={`flex items-center justify-between rounded-md px-4 py-3 ${isMe ? 'border border-brass/30 bg-brass/5' : 'border border-ink-line bg-ink'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${l.rank <= 3 ? 'bg-brass/20 text-brass' : 'bg-ink-soft text-slate-400'}`}>
                        {l.rank}
                      </span>
                      <div>
                        <span className={`text-sm ${isMe ? 'font-medium text-brass' : 'text-slate-200'}`}>{l.name}</span>
                        {isMe && <span className="ml-2 text-xs text-brass/60">You</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">{l.score}</span>
                      {delta !== null && delta !== 0 && (
                        <span className={`text-xs ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Squads */}
        <Section title="Squad Standings">
          {squads.length === 0 ? (
            <EmptyState message="No squad points recorded yet." />
          ) : (
            <div className="space-y-1">
              {squads.map((s) => (
                <div key={s.squad_id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${s.rank === 1 ? 'bg-brass/20 text-brass' : 'bg-ink-soft text-slate-400'}`}>
                      {s.rank}
                    </span>
                    <span className="text-sm text-slate-200">{s.name}</span>
                  </div>
                  <span className="text-sm font-medium text-brass">{s.total_points} pts</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}
