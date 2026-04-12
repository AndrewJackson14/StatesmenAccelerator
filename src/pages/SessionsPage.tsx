import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { SessionRow, SessionActivityRow, SessionAttendanceRow } from '@/types/database';

interface SessionWithActivities extends SessionRow {
  activities: SessionActivityRow[];
  attendance: SessionAttendanceRow | null;
}

export default function SessionsPage() {
  const { user, role } = useAuth();
  const uid = user?.id;

  const [sessions, setSessions] = useState<SessionWithActivities[]>([]);
  const [activeSession, setActiveSession] = useState<SessionWithActivities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (uid) loadSessions(); }, [uid]);

  async function loadSessions() {
    setLoading(true);

    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid!)
      .limit(1)
      .maybeSingle();

    if (!membership) { setLoading(false); return; }

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .order('scheduled_at', { ascending: true });

    if (!sessionData) { setSessions([]); setLoading(false); return; }

    const sessionIds = sessionData.map((s) => s.id);

    const { data: activities } = await supabase
      .from('session_activities')
      .select('*')
      .in('session_id', sessionIds)
      .order('sort_order', { ascending: true });

    const { data: attendance } = await supabase
      .from('session_attendance')
      .select('*')
      .in('session_id', sessionIds)
      .eq('user_id', uid!);

    const enriched: SessionWithActivities[] = sessionData.map((s) => ({
      ...s,
      activities: (activities ?? []).filter((a) => a.session_id === s.id),
      attendance: (attendance ?? []).find((a) => a.session_id === s.id) ?? null,
    }));

    setSessions(enriched);
    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading sessions…</div></div>;

  if (activeSession) {
    return <SessionDetail session={activeSession} role={role} uid={uid!} onBack={() => setActiveSession(null)} onRefresh={loadSessions} />;
  }

  const upcoming = sessions.filter((s) => s.status === 'scheduled');
  const live = sessions.filter((s) => s.status === 'live');
  const past = sessions.filter((s) => s.status === 'completed').reverse();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Sessions</h1>
        <p className="mt-1 text-sm text-slate-400">Your program sessions and activities.</p>
      </div>

      {/* Live sessions */}
      {live.length > 0 && (
        <Section title="Live Now">
          {live.map((s) => (
            <button key={s.id} onClick={() => setActiveSession(s)} className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-left transition hover:bg-emerald-500/10">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-emerald-400">{s.title ?? `Session ${s.session_number}`}</div>
                <span className="animate-pulse rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">LIVE</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{s.activities.length} activities · {s.phase}</div>
            </button>
          ))}
        </Section>
      )}

      {/* Upcoming */}
      <Section title={`Upcoming (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <EmptyState message="No upcoming sessions scheduled." />
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
                <div>
                  <div className="text-sm text-slate-100">{s.title ?? `Session ${s.session_number}`}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{fmtDate(s.scheduled_at)} · {s.phase}</div>
                </div>
                <div className="flex items-center gap-2">
                  {s.webex_link && <a href={s.webex_link} target="_blank" rel="noopener noreferrer" className="btn text-xs">Join</a>}
                  <span className="text-xs text-slate-500">{countdown(s.scheduled_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Past */}
      {past.length > 0 && (
        <Section title={`Completed (${past.length})`}>
          <div className="space-y-2">
            {past.map((s) => (
              <button key={s.id} onClick={() => setActiveSession(s)} className="flex w-full items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3 text-left transition hover:bg-ink-soft">
                <div>
                  <div className="text-sm text-slate-300">{s.title ?? `Session ${s.session_number}`}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{fmtDate(s.scheduled_at)} · {s.phase}</div>
                </div>
                <div className="flex items-center gap-2">
                  {s.attendance && <AttendanceBadge status={s.attendance.status} />}
                  <span className="text-xs text-slate-500">{s.activities.length} activities</span>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Session Detail ──

function SessionDetail({ session, onBack }: {
  session: SessionWithActivities;
  role: string | null;
  uid: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const isLive = session.status === 'live';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button className="text-sm text-slate-400 hover:text-slate-200" onClick={onBack}>← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl">{session.title ?? `Session ${session.session_number}`}</h1>
            {isLive && <span className="animate-pulse rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">LIVE</span>}
          </div>
          <div className="mt-1 text-sm text-slate-400">{session.phase} · {fmtDate(session.scheduled_at)} · {session.duration_min}min</div>
        </div>
        {session.webex_link && isLive && (
          <a href={session.webex_link} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs">Join Webex</a>
        )}
      </div>

      {session.description && (
        <div className="card">
          <div className="text-sm text-slate-300">{session.description}</div>
        </div>
      )}

      {/* Attendance */}
      {session.attendance && (
        <div className="card">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Your Attendance</div>
          <div className="flex items-center gap-4 text-sm">
            <AttendanceBadge status={session.attendance.status} />
            {session.attendance.duration_min && <span className="text-slate-400">{session.attendance.duration_min}min</span>}
            {session.attendance.camera_on_pct !== null && <span className="text-slate-400">Camera {session.attendance.camera_on_pct}%</span>}
          </div>
        </div>
      )}

      {/* Activities */}
      <div className="card">
        <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          Activities ({session.activities.length})
        </div>
        {session.activities.length === 0 ? (
          <EmptyState message={isLive ? 'Activities will appear as they are unlocked.' : 'No activities for this session.'} />
        ) : (
          <div className="space-y-3">
            {session.activities.map((a, i) => {
              const locked = !a.unlocked_at && isLive;
              return (
                <div
                  key={a.id}
                  className={`rounded-md border px-4 py-3 ${
                    locked
                      ? 'border-ink-line bg-ink opacity-50'
                      : 'border-ink-line bg-ink'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-soft text-xs text-slate-400">{i + 1}</span>
                      <span className="text-sm font-medium text-slate-100">{a.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActivityTypeBadge type={a.type} />
                      {locked && <span className="text-xs text-slate-600">Locked</span>}
                      {a.unlocked_at && <span className="text-xs text-emerald-500">✓</span>}
                    </div>
                  </div>
                  {!locked && a.content && typeof a.content === 'object' && (a.content as Record<string, unknown>).description ? (
                    <div className="mt-2 text-xs text-slate-400">{String((a.content as Record<string, unknown>).description)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">{message}</div>;
}

function AttendanceBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    present: 'bg-emerald-500/10 text-emerald-400',
    late: 'bg-yellow-500/10 text-yellow-400',
    absent: 'bg-red-500/10 text-red-400',
    left_early: 'bg-yellow-500/10 text-yellow-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.absent}`}>{status.replace('_', ' ')}</span>;
}

function ActivityTypeBadge({ type }: { type: string }) {
  return <span className="rounded bg-ink-soft px-1.5 py-0.5 text-xs text-slate-500">{type.replace(/_/g, ' ')}</span>;
}

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

function countdown(iso: string) {
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return 'Now';
  const h = Math.floor(d / 3600000);
  if (h < 1) return `${Math.floor(d / 60000)}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
