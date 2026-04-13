import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { CohortRow, CohortPhase } from '@/types/database';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultCohortId?: string;
}

type Mode = 'single' | 'batch';

const PHASE_OPTIONS: { value: CohortPhase; label: string }[] = [
  { value: 'phase1', label: 'Phase 1: Foundation (Weeks 1–3)' },
  { value: 'phase2a', label: 'Phase 2a: Junior (Weeks 4–6)' },
  { value: 'phase2b', label: 'Phase 2b: Senior (Weeks 7–9)' },
  { value: 'phase3', label: 'Phase 3: Lock-in (Weeks 10–13)' },
];

export default function CreateSessionModal({ open, onClose, onCreated, defaultCohortId }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('single');
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [cohortId, setCohortId] = useState(defaultCohortId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single-session fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<CohortPhase>('phase1');
  const [sessionNumber, setSessionNumber] = useState(1);
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState(90);
  const [webexLink, setWebexLink] = useState('');

  // Batch-13-weeks fields
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('19:00'); // 7pm local default

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('cohorts')
        .select('*')
        .neq('name', 'Intake Pool')
        .in('status', ['upcoming', 'active'])
        .order('name');
      setCohorts(data ?? []);
      if (data && data.length > 0 && !cohortId) setCohortId(defaultCohortId ?? data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleSingle(e: FormEvent) {
    e.preventDefault();
    if (!cohortId || !scheduledAt) {
      setError('Cohort and scheduled time are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: session, error: dbErr } = await supabase
      .from('sessions')
      .insert({
        cohort_id: cohortId,
        session_number: sessionNumber,
        phase,
        title: title.trim() || null,
        description: description.trim() || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_min: durationMin,
        webex_link: webexLink.trim() || null,
        status: 'scheduled',
      })
      .select()
      .single();

    if (dbErr || !session) {
      setSaving(false);
      setError(dbErr?.message ?? 'Could not create session.');
      return;
    }

    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: 'session_created',
      entity_type: 'session',
      entity_id: session.id,
      details: { cohort_id: cohortId, phase, session_number: sessionNumber },
    });

    setSaving(false);
    reset();
    onCreated();
    onClose();
  }

  async function handleBatch(e: FormEvent) {
    e.preventDefault();
    if (!cohortId || !startDate) {
      setError('Cohort and start date are required.');
      return;
    }
    setSaving(true);
    setError(null);

    // Generate a full 13-week schedule following the spec's 3-6-4 structure:
    //   Phase 1 (weeks 1-3): 2 sessions/week Tue+Thu
    //   Phase 2a (weeks 4-6): 3 sessions/week Mon+Wed+Fri
    //   Phase 2b (weeks 7-9): 3 sessions/week Mon+Wed+Fri
    //   Phase 3 (weeks 10-13): 2 sessions/week Tue+Thu
    // Total: 32 sessions
    const start = new Date(`${startDate}T${startTime}`);
    const rows: Array<{
      cohort_id: string;
      session_number: number;
      phase: CohortPhase;
      scheduled_at: string;
      duration_min: number;
      status: 'scheduled';
      title: string;
    }> = [];

    let sessionNum = 1;
    const dayOffset = (week: number, dayOfWeek: number) => {
      // week is 1-indexed, dayOfWeek is 0 (Mon) through 6 (Sun) relative to start
      return (week - 1) * 7 + dayOfWeek;
    };

    function addSession(phaseValue: CohortPhase, week: number, dayOfWeek: number, label: string) {
      const d = new Date(start);
      d.setDate(d.getDate() + dayOffset(week, dayOfWeek));
      rows.push({
        cohort_id: cohortId,
        session_number: sessionNum,
        phase: phaseValue,
        scheduled_at: d.toISOString(),
        duration_min: 90,
        status: 'scheduled',
        title: `Week ${week}: ${label}`,
      });
      sessionNum += 1;
    }

    // Phase 1 (weeks 1-3): Tue (day 1), Thu (day 3)
    for (let w = 1; w <= 3; w++) {
      addSession('phase1', w, 1, 'Foundation Tuesday');
      addSession('phase1', w, 3, 'Foundation Thursday');
    }
    // Phase 2a (weeks 4-6): Mon (0), Wed (2), Fri (4)
    for (let w = 4; w <= 6; w++) {
      addSession('phase2a', w, 0, 'Junior Monday');
      addSession('phase2a', w, 2, 'Junior Wednesday');
      addSession('phase2a', w, 4, 'Junior Friday');
    }
    // Phase 2b (weeks 7-9): Mon, Wed, Fri
    for (let w = 7; w <= 9; w++) {
      addSession('phase2b', w, 0, 'Senior Monday');
      addSession('phase2b', w, 2, 'Senior Wednesday');
      addSession('phase2b', w, 4, 'Senior Friday');
    }
    // Phase 3 (weeks 10-13): Tue, Thu
    for (let w = 10; w <= 13; w++) {
      addSession('phase3', w, 1, 'Lock-in Tuesday');
      addSession('phase3', w, 3, 'Lock-in Thursday');
    }

    const { error: dbErr } = await supabase.from('sessions').insert(rows);
    if (dbErr) {
      setSaving(false);
      setError(dbErr.message);
      return;
    }

    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: 'session_batch_created',
      entity_type: 'cohort',
      entity_id: cohortId,
      details: { session_count: rows.length, start_date: startDate },
    });

    setSaving(false);
    reset();
    onCreated();
    onClose();
  }

  function reset() {
    setTitle('');
    setDescription('');
    setSessionNumber(1);
    setScheduledAt('');
    setWebexLink('');
    setStartDate('');
    setError(null);
  }

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="text-xl">Create Session</h2>
          <div className="flex gap-1 rounded-md border border-ink-line bg-ink p-0.5 text-xs">
            <button
              type="button"
              className={`rounded px-3 py-1 transition ${
                mode === 'single' ? 'bg-brass/20 text-brass' : 'text-slate-400'
              }`}
              onClick={() => setMode('single')}
            >
              Single
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 transition ${
                mode === 'batch' ? 'bg-brass/20 text-brass' : 'text-slate-400'
              }`}
              onClick={() => setMode('batch')}
            >
              Batch 13 weeks
            </button>
          </div>
        </div>

        <Field label="Cohort">
          <select className="input" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
            <option value="">— Select a cohort —</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {mode === 'single' ? (
          <form onSubmit={handleSingle} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phase">
                <select
                  className="input"
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as CohortPhase)}
                >
                  {PHASE_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Session Number">
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={32}
                  value={sessionNumber}
                  onChange={(e) => setSessionNumber(parseInt(e.target.value) || 1)}
                />
              </Field>
            </div>

            <Field label="Title">
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Week 1 Tuesday — Foundation: Identity"
              />
            </Field>

            <Field label="Description">
              <textarea
                className="input min-h-[60px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pre-session prep, agenda, or framing."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scheduled Time">
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </Field>
              <Field label="Duration (min)">
                <input
                  type="number"
                  className="input"
                  min={15}
                  max={240}
                  value={durationMin}
                  onChange={(e) => setDurationMin(parseInt(e.target.value) || 90)}
                />
              </Field>
            </div>

            <Field label="Webex Link">
              <input
                className="input"
                value={webexLink}
                onChange={(e) => setWebexLink(e.target.value)}
                placeholder="https://webex.com/meet/..."
              />
            </Field>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || !cohortId}>
                {saving ? 'Creating…' : 'Create Session'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBatch} className="space-y-4">
            <div className="rounded-md border border-ink-line bg-ink p-3 text-xs leading-relaxed text-slate-400">
              Generates all 32 sessions for a 13-week cohort following the spec's
              3-6-4 structure: Phase 1 (6 sessions, Tue/Thu), Phase 2a/2b
              (9 each, Mon/Wed/Fri), Phase 3 (8, Tue/Thu). Titles auto-populate
              with phase + weekday. Duration defaults to 90 min. You can edit
              individual sessions afterwards.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cohort Start Date (Week 1)">
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Default Start Time (local)">
                <input
                  type="time"
                  className="input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || !cohortId}>
                {saving ? 'Generating 32 sessions…' : 'Generate 13-Week Schedule'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-ink-line bg-ink-soft p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
