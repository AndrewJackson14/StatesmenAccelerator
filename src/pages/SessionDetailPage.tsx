import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type {
  SessionRow,
  SessionActivityRow,
  SessionAttendanceRow,
  ActivityType,
  ProfileRow,
  AttendanceStatus,
} from '@/types/database';

type Phase = 'pre' | 'live' | 'post';

interface SessionWithJoin extends SessionRow {
  activities: SessionActivityRow[];
  myAttendance: SessionAttendanceRow | null;
  cohort_members: { user_id: string; profile: Pick<ProfileRow, 'id' | 'name'> }[];
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionWithJoin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);

    const { data: s, error: se } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (se || !s) {
      setError('Session not found.');
      setLoading(false);
      return;
    }

    const { data: activities } = await supabase
      .from('session_activities')
      .select('*')
      .eq('session_id', id)
      .order('sort_order', { ascending: true });

    const { data: myAtt } = await supabase
      .from('session_attendance')
      .select('*')
      .eq('session_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    // Load cohort roster for attendance marking + peer rating
    const { data: members } = await supabase
      .from('cohort_members')
      .select('user_id, profiles!cohort_members_user_id_fkey(id, name)')
      .eq('cohort_id', s.cohort_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roster = ((members as any[]) ?? []).map((m) => ({
      user_id: m.user_id,
      profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
    }));

    setSession({
      ...(s as SessionRow),
      activities: activities ?? [],
      myAttendance: myAtt ?? null,
      cohort_members: roster,
    });
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Loading session…
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="card space-y-2">
        <div className="text-lg">{error ?? 'Session not found'}</div>
        <Link to="/sessions" className="text-sm text-brass hover:underline">
          ← Back to sessions
        </Link>
      </div>
    );
  }

  const phase = computePhase(session);
  const isHeadmaster = role === 'headmaster';
  const isCaptain = role === 'captain';
  const isStaff = isHeadmaster || isCaptain;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/sessions" className="text-xs text-slate-500 hover:text-brass">
          ← Sessions
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl">
                {session.title ?? `Session ${session.session_number}`}
              </h1>
              <PhaseBadge phase={phase} status={session.status} />
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {formatPhase(session.phase)} · {fmtDateTime(session.scheduled_at)} ·{' '}
              {session.duration_min}min
            </div>
          </div>
          {phase === 'live' && session.webex_link && (
            <a
              href={session.webex_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Join Webex →
            </a>
          )}
        </div>
      </div>

      {session.description && (
        <div className="card text-sm text-slate-300">{session.description}</div>
      )}

      {/* Phase-specific body */}
      {phase === 'pre' && <PreSessionBody session={session} />}
      {phase === 'live' && (
        <LiveSessionBody
          session={session}
          userId={user!.id}
          isStaff={isStaff}
          onChanged={load}
        />
      )}
      {phase === 'post' && (
        <PostSessionBody
          session={session}
          userId={user!.id}
          isStaff={isStaff}
          isHeadmaster={isHeadmaster}
          onChanged={load}
          onMarkComplete={async () => {
            await supabase
              .from('sessions')
              .update({ status: 'completed' })
              .eq('id', session.id);
            load();
          }}
        />
      )}

      {/* Staff controls (live/post) */}
      {isStaff && phase !== 'pre' && (
        <div className="card space-y-3">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Staff Controls
          </div>
          <div className="flex flex-wrap gap-2">
            {session.status === 'scheduled' && (
              <button
                className="btn text-xs"
                onClick={async () => {
                  await supabase.from('sessions').update({ status: 'live' }).eq('id', session.id);
                  load();
                }}
              >
                Mark Live
              </button>
            )}
            {session.status === 'live' && (
              <button
                className="btn text-xs"
                onClick={async () => {
                  await supabase
                    .from('sessions')
                    .update({ status: 'completed' })
                    .eq('id', session.id);
                  load();
                }}
              >
                Mark Complete
              </button>
            )}
            {isHeadmaster && (
              <button
                className="btn text-xs text-red-400"
                onClick={async () => {
                  if (!confirm('Cancel this session?')) return;
                  await supabase
                    .from('sessions')
                    .update({ status: 'cancelled' })
                    .eq('id', session.id);
                  navigate('/sessions');
                }}
              >
                Cancel Session
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Phase computation
// ============================================================

function computePhase(s: SessionRow): Phase {
  if (s.status === 'completed' || s.status === 'cancelled') return 'post';
  const now = Date.now();
  const start = new Date(s.scheduled_at).getTime();
  const end = start + (s.duration_min ?? 90) * 60_000 + 15 * 60_000; // 15-min grace
  if (now < start - 15 * 60_000) return 'pre';
  if (now > end) return 'post';
  return 'live';
}

// ============================================================
// Pre-session
// ============================================================

function PreSessionBody({ session }: { session: SessionWithJoin }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(session.scheduled_at));
  useEffect(() => {
    const i = setInterval(() => setCountdown(formatCountdown(session.scheduled_at)), 1000);
    return () => clearInterval(i);
  }, [session.scheduled_at]);

  return (
    <div className="space-y-6">
      <div className="card text-center">
        <div className="text-xs uppercase tracking-wider text-slate-500">Starts in</div>
        <div className="mt-2 font-serif text-4xl text-brass">{countdown}</div>
        <div className="mt-2 text-xs text-slate-500">
          The Webex link will unlock 15 minutes before the session starts.
        </div>
      </div>

      {session.activities.length > 0 && (
        <div className="card">
          <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
            Agenda ({session.activities.length})
          </div>
          <ol className="space-y-2">
            {session.activities.map((a, i) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-md border border-ink-line bg-ink px-3 py-2"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-soft text-xs text-slate-400">
                  {i + 1}
                </span>
                <div className="flex-1 text-sm">
                  <div className="text-slate-100">{a.title}</div>
                  <div className="text-xs text-slate-500">{formatActivityType(a.type)}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Live session
// ============================================================

function LiveSessionBody({
  session,
  userId,
  isStaff,
  onChanged,
}: {
  session: SessionWithJoin;
  userId: string;
  isStaff: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Activities ({session.activities.length})
          </div>
        </div>
        {session.activities.length === 0 ? (
          <Empty message="No activities configured for this session." />
        ) : (
          <div className="space-y-4">
            {session.activities.map((a, i) => (
              <ActivityCard
                key={a.id}
                index={i}
                activity={a}
                session={session}
                userId={userId}
                isStaff={isStaff}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Post-session
// ============================================================

function PostSessionBody({
  session,
  userId,
  isStaff,
  isHeadmaster,
  onChanged,
  onMarkComplete,
}: {
  session: SessionWithJoin;
  userId: string;
  isStaff: boolean;
  isHeadmaster: boolean;
  onChanged: () => void;
  onMarkComplete: () => void;
}) {
  return (
    <div className="space-y-6">
      {session.myAttendance ? (
        <div className="card">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Your Attendance
          </div>
          <div className="flex items-center gap-4 text-sm">
            <AttendanceBadge status={session.myAttendance.status} />
            {session.myAttendance.duration_min && (
              <span className="text-slate-400">{session.myAttendance.duration_min}min</span>
            )}
          </div>
        </div>
      ) : (
        !isStaff && (
          <div className="card text-sm text-slate-500">
            Attendance not yet marked.
          </div>
        )
      )}

      {isStaff && (
        <AttendanceMarkingCard session={session} onChanged={onChanged} />
      )}

      <div className="card">
        <div className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          Activity Archive ({session.activities.length})
        </div>
        {session.activities.length === 0 ? (
          <Empty message="No activities were run in this session." />
        ) : (
          <div className="space-y-2">
            {session.activities.map((a, i) => (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-md border border-ink-line bg-ink px-4 py-3 opacity-80"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-soft text-xs text-slate-400">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="text-sm text-slate-200">{a.title}</div>
                  <div className="text-xs text-slate-500">{formatActivityType(a.type)}</div>
                </div>
                {a.unlocked_at && <span className="text-xs text-emerald-500">✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {isHeadmaster && session.status === 'scheduled' && (
        <button className="btn text-xs" onClick={onMarkComplete}>
          Mark Session Complete
        </button>
      )}

      {/* Suppress unused-vars lints without removing args */}
      {false && <span>{userId}</span>}
    </div>
  );
}

// ============================================================
// Activity card — dispatches to type-specific renderer
// ============================================================

function ActivityCard({
  index,
  activity,
  session,
  userId,
  isStaff,
  onChanged,
}: {
  index: number;
  activity: SessionActivityRow;
  session: SessionWithJoin;
  userId: string;
  isStaff: boolean;
  onChanged: () => void;
}) {
  const locked = !activity.unlocked_at;
  const [open, setOpen] = useState(!locked);

  async function unlock() {
    await supabase
      .from('session_activities')
      .update({ unlocked_at: new Date().toISOString() })
      .eq('id', activity.id);
    onChanged();
  }

  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        locked ? 'border-ink-line bg-ink opacity-60' : 'border-brass/30 bg-ink-soft'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-soft text-xs text-slate-400">
            {index + 1}
          </span>
          <div>
            <div className="text-sm font-medium text-slate-100">{activity.title}</div>
            <div className="text-xs text-slate-500">{formatActivityType(activity.type)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {locked && <span className="text-xs text-slate-600">Locked</span>}
          {activity.unlocked_at && !locked && (
            <button
              className="text-xs text-slate-500 hover:text-slate-200"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? '▾' : '▸'}
            </button>
          )}
          {locked && isStaff && (
            <button className="btn text-xs" onClick={unlock}>
              Unlock
            </button>
          )}
        </div>
      </div>

      {!locked && open && (
        <div className="mt-4 border-t border-ink-line pt-4">
          <ActivityRenderer
            activity={activity}
            session={session}
            userId={userId}
            isStaff={isStaff}
            onSubmitted={onChanged}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Activity renderers — one per ActivityType
// ============================================================

function ActivityRenderer({
  activity,
  session,
  userId,
  isStaff,
  onSubmitted,
}: {
  activity: SessionActivityRow;
  session: SessionWithJoin;
  userId: string;
  isStaff: boolean;
  onSubmitted: () => void;
}) {
  switch (activity.type as ActivityType) {
    case 'peer_rating':
      return <PeerRatingActivity session={session} userId={userId} onSubmitted={onSubmitted} />;
    case 'challenge_log':
      return <ChallengeLogActivity session={session} userId={userId} onSubmitted={onSubmitted} />;
    case 'commitment_entry':
      return <CommitmentEntryActivity activity={activity} userId={userId} onSubmitted={onSubmitted} />;
    case 'hot_seat':
      return <HotSeatActivity activity={activity} userId={userId} onSubmitted={onSubmitted} />;
    case 'squad_vote':
      return <SquadVoteActivity session={session} userId={userId} onSubmitted={onSubmitted} />;
    case 'observation':
      return <ObservationActivity session={session} isStaff={isStaff} onSubmitted={onSubmitted} />;
    case 'flag_submission':
      return <FlagSubmissionActivity session={session} isStaff={isStaff} onSubmitted={onSubmitted} />;
    case 'attendance':
      return <AttendanceCheckinActivity session={session} userId={userId} onSubmitted={onSubmitted} />;
    default:
      return <div className="text-xs text-slate-500">Unknown activity type: {activity.type}</div>;
  }
}

// ── peer_rating ──

function PeerRatingActivity({
  session,
  userId,
  onSubmitted,
}: {
  session: SessionWithJoin;
  userId: string;
  onSubmitted: () => void;
}) {
  const peers = session.cohort_members.filter((m) => m.user_id !== userId);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const rows = Object.entries(ratings).map(([ratee_id, rating]) => ({
      session_id: session.id,
      rater_id: userId,
      ratee_id,
      rating,
      note: notes[ratee_id]?.trim() || null,
    }));
    if (rows.length > 0) {
      await supabase.from('peer_ratings').insert(rows);
    }
    setSaving(false);
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Rate each peer 1–5 on engagement and contribution for this session. Optional private note.
      </p>
      {peers.length === 0 ? (
        <Empty message="No peers in your cohort yet." />
      ) : (
        <div className="space-y-2">
          {peers.map((p) => (
            <div key={p.user_id} className="rounded-md border border-ink-line bg-ink p-3">
              <div className="mb-2 text-sm text-slate-100">{p.profile?.name ?? 'Unnamed'}</div>
              <div className="mb-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`h-8 w-8 rounded border text-sm ${
                      ratings[p.user_id] === v
                        ? 'border-brass bg-brass/20 text-brass'
                        : 'border-ink-line text-slate-500 hover:border-brass/50'
                    }`}
                    onClick={() => setRatings((r) => ({ ...r, [p.user_id]: v }))}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <input
                className="input text-xs"
                placeholder="Optional note (private)"
                value={notes[p.user_id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [p.user_id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <button
        className="btn-primary text-xs"
        onClick={submit}
        disabled={saving || Object.keys(ratings).length === 0}
      >
        {saving ? 'Submitting…' : 'Submit Ratings'}
      </button>
    </div>
  );
}

// ── challenge_log ──

function ChallengeLogActivity({
  session,
  userId,
  onSubmitted,
}: {
  session: SessionWithJoin;
  userId: string;
  onSubmitted: () => void;
}) {
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    // Look up the current challenge for this cohort/week (best-effort)
    const { data: challenge } = await supabase
      .from('challenges')
      .select('id')
      .eq('cohort_id', session.cohort_id)
      .order('week', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challenge) {
      await supabase.from('challenge_completions').insert({
        challenge_id: challenge.id,
        user_id: userId,
        result: result.trim() || null,
      });
    }
    setSaving(false);
    setResult('');
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Log the completion of this week's challenge. Add a short result or reflection.
      </p>
      <textarea
        className="input min-h-[80px] text-sm"
        value={result}
        onChange={(e) => setResult(e.target.value)}
        placeholder="What did you do? What did you learn?"
      />
      <button className="btn-primary text-xs" onClick={submit} disabled={saving}>
        {saving ? 'Logging…' : 'Mark Complete'}
      </button>
    </div>
  );
}

// ── commitment_entry ──

function CommitmentEntryActivity({
  activity,
  userId,
  onSubmitted,
}: {
  activity: SessionActivityRow;
  userId: string;
  onSubmitted: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'commitment_entry',
      entity_type: 'session_activity',
      entity_id: activity.id,
      details: { commitment: text.trim() },
    });
    setSaving(false);
    setText('');
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Write your commitment out loud. This is between you and the brotherhood.
      </p>
      <textarea
        className="input min-h-[80px] text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="I commit to…"
      />
      <button
        className="btn-primary text-xs"
        onClick={submit}
        disabled={saving || !text.trim()}
      >
        {saving ? 'Submitting…' : 'Submit Commitment'}
      </button>
    </div>
  );
}

// ── hot_seat ──

function HotSeatActivity({
  activity,
  userId,
  onSubmitted,
}: {
  activity: SessionActivityRow;
  userId: string;
  onSubmitted: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const prompt = (activity.content as Record<string, string> | null)?.prompt;

  async function submit() {
    setSaving(true);
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'hot_seat_response',
      entity_type: 'session_activity',
      entity_id: activity.id,
      details: { response: text.trim(), prompt: prompt ?? null },
    });
    setSaving(false);
    setText('');
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      {prompt ? (
        <div className="rounded-md border border-brass/30 bg-brass/5 p-3 text-sm text-slate-100">
          {prompt}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Respond to the prompt from your Captain.</p>
      )}
      <input
        className="input text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Your response"
      />
      <button
        className="btn-primary text-xs"
        onClick={submit}
        disabled={saving || !text.trim()}
      >
        {saving ? 'Submitting…' : 'Send Response'}
      </button>
    </div>
  );
}

// ── squad_vote ──

function SquadVoteActivity({
  session,
  userId,
  onSubmitted,
}: {
  session: SessionWithJoin;
  userId: string;
  onSubmitted: () => void;
}) {
  const candidates = session.cohort_members.filter((m) => m.user_id !== userId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!chosen) return;
    setSaving(true);
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'squad_vote',
      entity_type: 'session',
      entity_id: session.id,
      details: { voted_for: chosen },
    });
    setSaving(false);
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Cast your vote for this session's nomination.
      </p>
      <div className="space-y-1">
        {candidates.map((c) => (
          <label
            key={c.user_id}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
              chosen === c.user_id ? 'border-brass bg-brass/10' : 'border-ink-line bg-ink'
            }`}
          >
            <input
              type="radio"
              name="vote"
              className="accent-brass"
              checked={chosen === c.user_id}
              onChange={() => setChosen(c.user_id)}
            />
            <span className="text-sm text-slate-200">{c.profile?.name ?? 'Unnamed'}</span>
          </label>
        ))}
      </div>
      <button className="btn-primary text-xs" onClick={submit} disabled={saving || !chosen}>
        {saving ? 'Voting…' : 'Submit Vote'}
      </button>
    </div>
  );
}

// ── observation (staff-only) ──

function ObservationActivity({
  session,
  isStaff,
  onSubmitted,
}: {
  session: SessionWithJoin;
  isStaff: boolean;
  onSubmitted: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  if (!isStaff) {
    return <p className="text-xs text-slate-500">Captain-only activity.</p>;
  }

  async function submit() {
    if (!selected) return;
    setSaving(true);
    await supabase.from('coach_observations').insert({
      session_id: session.id,
      captain_id: user!.id,
      gentleman_id: selected,
      engagement: engagement || null,
      behaviors: {},
      flags: [],
      notes: notes.trim() || null,
    });
    setSaving(false);
    setSelected(null);
    setEngagement('');
    setNotes('');
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <select
        className="input text-sm"
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value || null)}
      >
        <option value="">— Select Gentleman —</option>
        {session.cohort_members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.profile?.name ?? 'Unnamed'}
          </option>
        ))}
      </select>
      <select
        className="input text-sm"
        value={engagement}
        onChange={(e) => setEngagement(e.target.value)}
      >
        <option value="">— Engagement level —</option>
        <option value="high">High</option>
        <option value="moderate">Moderate</option>
        <option value="low">Low</option>
        <option value="disengaged">Disengaged</option>
      </select>
      <textarea
        className="input min-h-[60px] text-sm"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What did you notice?"
      />
      <button className="btn-primary text-xs" onClick={submit} disabled={saving || !selected}>
        {saving ? 'Saving…' : 'Save Observation'}
      </button>
    </div>
  );
}

// ── flag_submission (staff-only) ──

function FlagSubmissionActivity({
  session,
  isStaff,
  onSubmitted,
}: {
  session: SessionWithJoin;
  isStaff: boolean;
  onSubmitted: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [flagType, setFlagType] = useState('concern_engagement');
  const [severity, setSeverity] = useState<'yellow' | 'red'>('yellow');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  if (!isStaff) {
    return <p className="text-xs text-slate-500">Captain-only activity.</p>;
  }

  async function submit() {
    if (!selected) return;
    setSaving(true);
    await supabase.from('flags').insert({
      user_id: selected,
      cohort_id: session.cohort_id,
      flag_type: flagType,
      severity,
      trigger_data: { session_id: session.id, captain_id: user?.id },
    });
    setSaving(false);
    setSelected(null);
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <select
        className="input text-sm"
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value || null)}
      >
        <option value="">— Flag which Gentleman —</option>
        {session.cohort_members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.profile?.name ?? 'Unnamed'}
          </option>
        ))}
      </select>
      <select
        className="input text-sm"
        value={flagType}
        onChange={(e) => setFlagType(e.target.value)}
      >
        <option value="concern_engagement">Concern — engagement</option>
        <option value="concern_behavior">Concern — behavior</option>
        <option value="concern_wellbeing">Concern — wellbeing</option>
        <option value="breakthrough">Breakthrough</option>
      </select>
      <select
        className="input text-sm"
        value={severity}
        onChange={(e) => setSeverity(e.target.value as 'yellow' | 'red')}
      >
        <option value="yellow">Yellow</option>
        <option value="red">Red</option>
      </select>
      <button className="btn-primary text-xs" onClick={submit} disabled={saving || !selected}>
        {saving ? 'Submitting…' : 'Submit Flag'}
      </button>
    </div>
  );
}

// ── attendance (self check-in) ──

function AttendanceCheckinActivity({
  session,
  userId,
  onSubmitted,
}: {
  session: SessionWithJoin;
  userId: string;
  onSubmitted: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const already = session.myAttendance !== null;

  async function checkIn() {
    setSaving(true);
    await supabase
      .from('session_attendance')
      .upsert(
        {
          session_id: session.id,
          user_id: userId,
          status: 'present',
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,user_id' },
      );
    setSaving(false);
    onSubmitted();
  }

  if (already) {
    return (
      <div className="text-sm text-emerald-400">
        ✓ You're checked in ({session.myAttendance?.status}).
      </div>
    );
  }

  return (
    <button className="btn-primary text-xs" onClick={checkIn} disabled={saving}>
      {saving ? 'Checking in…' : 'Check In'}
    </button>
  );
}

// ============================================================
// Captain attendance marking — grid of cohort members
// ============================================================

function AttendanceMarkingCard({
  session,
  onChanged,
}: {
  session: SessionWithJoin;
  onChanged: () => void;
}) {
  const [existing, setExisting] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('session_attendance')
        .select('user_id, status')
        .eq('session_id', session.id);
      const map: Record<string, AttendanceStatus> = {};
      for (const row of (data ?? []) as { user_id: string; status: AttendanceStatus }[]) {
        map[row.user_id] = row.status;
      }
      setExisting(map);
      setLoading(false);
    })();
  }, [session.id]);

  async function mark(userId: string, status: AttendanceStatus) {
    setSaving(userId);
    await supabase.from('session_attendance').upsert(
      {
        session_id: session.id,
        user_id: userId,
        status,
      },
      { onConflict: 'session_id,user_id' },
    );
    setExisting((e) => ({ ...e, [userId]: status }));
    setSaving(null);
    onChanged();
  }

  if (loading) {
    return (
      <div className="card text-sm text-slate-500">Loading roster…</div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Mark Attendance
      </div>
      {session.cohort_members.length === 0 ? (
        <Empty message="No members in this cohort." />
      ) : (
        <div className="space-y-2">
          {session.cohort_members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-3 py-2"
            >
              <div className="text-sm text-slate-200">
                {m.profile?.name ?? 'Unnamed'}
              </div>
              <div className="flex gap-1">
                {(['present', 'late', 'left_early', 'absent'] as AttendanceStatus[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={saving === m.user_id}
                      onClick={() => mark(m.user_id, s)}
                      className={`rounded px-2 py-1 text-xs transition ${
                        existing[m.user_id] === s
                          ? 'bg-brass/20 text-brass'
                          : 'bg-ink-soft text-slate-500 hover:text-slate-200'
                      }`}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// UI helpers
// ============================================================

function PhaseBadge({ phase, status }: { phase: Phase; status: string }) {
  if (status === 'cancelled')
    return (
      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
        Cancelled
      </span>
    );
  if (phase === 'live')
    return (
      <span className="animate-pulse rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
        LIVE
      </span>
    );
  if (phase === 'post')
    return (
      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs text-slate-400">
        Completed
      </span>
    );
  return (
    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
      Upcoming
    </span>
  );
}

function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const styles: Record<AttendanceStatus, string> = {
    present: 'bg-emerald-500/10 text-emerald-400',
    late: 'bg-yellow-500/10 text-yellow-400',
    absent: 'bg-red-500/10 text-red-400',
    left_early: 'bg-yellow-500/10 text-yellow-400',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function formatPhase(phase: string) {
  return {
    phase1: 'Phase 1: Foundation',
    phase2a: 'Phase 2a: Junior',
    phase2b: 'Phase 2b: Senior',
    phase3: 'Phase 3: Lock-in',
  }[phase] ?? phase;
}

function formatActivityType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCountdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
