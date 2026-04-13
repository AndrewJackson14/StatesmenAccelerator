import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import CreateSessionModal from '@/components/CreateSessionModal';
import type { SessionRow, CohortRow } from '@/types/database';

export default function SessionsPage() {
  const { user, role } = useAuth();
  const uid = user?.id;
  const isHeadmaster = role === 'headmaster';

  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);

    // Headmaster: load every non-Intake-Pool cohort, let them filter.
    // Captain: load cohorts where they have staff_cohort_participation rows.
    //          (fallback: cohorts matching their assigned squads).
    // Gentleman: their cohort_members row(s) minus Intake Pool.
    let cohortRows: CohortRow[] = [];
    if (isHeadmaster) {
      const { data } = await supabase
        .from('cohorts')
        .select('*')
        .neq('name', 'Intake Pool')
        .order('name');
      cohortRows = data ?? [];
    } else {
      const { data: memberships } = await supabase
        .from('cohort_members')
        .select('cohort_id, cohorts!cohort_members_cohort_id_fkey(*)')
        .eq('user_id', uid);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cohortRows = ((memberships as any[]) ?? [])
        .map((m) => (Array.isArray(m.cohorts) ? m.cohorts[0] : m.cohorts))
        .filter((c: CohortRow | undefined): c is CohortRow => !!c && c.name !== 'Intake Pool');
    }
    setCohorts(cohortRows);

    const pickedId = selectedCohortId || cohortRows[0]?.id || '';
    if (!selectedCohortId && pickedId) setSelectedCohortId(pickedId);

    if (!pickedId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('cohort_id', pickedId)
      .order('scheduled_at', { ascending: true });

    setSessions(sessionData ?? []);
    setLoading(false);
  }, [uid, isHeadmaster, selectedCohortId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Loading sessions…
      </div>
    );
  }

  const now = Date.now();
  const upcoming = sessions.filter((s) => {
    const start = new Date(s.scheduled_at).getTime();
    return s.status === 'scheduled' && start > now - 15 * 60_000;
  });
  const live = sessions.filter((s) => s.status === 'live');
  const past = sessions
    .filter((s) => s.status === 'completed' || s.status === 'cancelled')
    .slice()
    .reverse();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Sessions</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isHeadmaster
              ? 'All sessions across cohorts.'
              : 'Your cohort program schedule.'}
          </p>
        </div>
        {isHeadmaster && (
          <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
            + Session
          </button>
        )}
      </div>

      {cohorts.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-slate-500">Cohort</span>
          <select
            className="input max-w-xs"
            value={selectedCohortId}
            onChange={(e) => setSelectedCohortId(e.target.value)}
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {cohorts.length === 0 ? (
        <EmptyState message="No cohorts available. Headmaster needs to create one first." />
      ) : sessions.length === 0 ? (
        <EmptyState
          message={
            isHeadmaster
              ? 'No sessions scheduled for this cohort. Click "+ Session" or use the Batch 13-week generator.'
              : 'No sessions scheduled yet. Your Headmaster will publish the schedule soon.'
          }
        />
      ) : (
        <>
          {live.length > 0 && (
            <Section title="Live Now">
              <div className="space-y-2">
                {live.map((s) => (
                  <SessionCard key={s.id} session={s} emphasis="live" />
                ))}
              </div>
            </Section>
          )}

          <Section title={`Upcoming (${upcoming.length})`}>
            {upcoming.length === 0 ? (
              <EmptyState message="No upcoming sessions." />
            ) : (
              <div className="space-y-2">
                {upcoming.map((s) => (
                  <SessionCard key={s.id} session={s} />
                ))}
              </div>
            )}
          </Section>

          {past.length > 0 && (
            <Section title={`Completed (${past.length})`}>
              <div className="space-y-2">
                {past.map((s) => (
                  <SessionCard key={s.id} session={s} emphasis="past" />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      <CreateSessionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
        defaultCohortId={selectedCohortId}
      />
    </div>
  );
}

function SessionCard({
  session,
  emphasis,
}: {
  session: SessionRow;
  emphasis?: 'live' | 'past';
}) {
  const borderClass =
    emphasis === 'live'
      ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
      : emphasis === 'past'
      ? 'border-ink-line bg-ink opacity-70 hover:opacity-100'
      : 'border-ink-line bg-ink hover:border-brass/50 hover:bg-ink-soft';

  return (
    <Link
      to={`/sessions/${session.id}`}
      className={`flex items-center justify-between rounded-md border px-4 py-3 transition ${borderClass}`}
    >
      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-slate-100">
            {session.title ?? `Session ${session.session_number}`}
          </div>
          {emphasis === 'live' && (
            <span className="animate-pulse rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
              LIVE
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {formatPhase(session.phase)} · {fmtDate(session.scheduled_at)} ·{' '}
          {session.duration_min}min
        </div>
      </div>
      <div className="text-xs text-slate-500">
        {emphasis !== 'past' && countdown(session.scheduled_at)} →
      </div>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-line py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function formatPhase(phase: string) {
  return (
    {
      phase1: 'Phase 1',
      phase2a: 'Phase 2a',
      phase2b: 'Phase 2b',
      phase3: 'Phase 3',
    }[phase] ?? phase
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function countdown(iso: string) {
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return 'Now';
  const h = Math.floor(d / 3600000);
  if (h < 1) return `in ${Math.floor(d / 60000)}m`;
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}
