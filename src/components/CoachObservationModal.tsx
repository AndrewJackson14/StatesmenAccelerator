import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { SessionRow, ProfileRow, EngagementLevel, ParticipationQuality } from '@/types/database';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const BEHAVIORS = [
  'Volunteered for difficult task',
  'Supported struggling squadmate',
  'Took charge when needed',
  'Held others accountable constructively',
  'Remained composed under pressure',
  'Demonstrated vulnerability/honesty',
];

const FLAG_OPTIONS = [
  { key: 'breakthrough', label: 'Breakthrough Moment', severity: 'positive' as const },
  { key: 'concern_engagement', label: 'Concern: Engagement', severity: 'yellow' as const },
  { key: 'concern_behavior', label: 'Concern: Behavior', severity: 'yellow' as const },
  { key: 'concern_wellbeing', label: 'Concern: Wellbeing', severity: 'red' as const },
  { key: 'escalation_required', label: 'Escalation Required', severity: 'red' as const },
];

export default function CoachObservationModal({ open, onClose, onSubmitted }: Props) {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [gentlemen, setGentlemen] = useState<ProfileRow[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedGentleman, setSelectedGentleman] = useState('');
  const [engagement, setEngagement] = useState<EngagementLevel | ''>('');
  const [participation, setParticipation] = useState<ParticipationQuality | ''>('');
  const [behaviors, setBehaviors] = useState<Record<string, 'yes' | 'no' | 'na'>>({});
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  async function loadData() {
    // Get captain's cohort
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', user!.id)
      .limit(1)
      .maybeSingle();

    if (!membership) return;

    // Recent completed sessions
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false })
      .limit(10);

    setSessions(sessionData ?? []);

    // Gentlemen in cohort
    const { data: members } = await supabase
      .from('cohort_members')
      .select('user_id')
      .eq('cohort_id', membership.cohort_id)
      .eq('role', 'gentleman');

    if (members && members.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', members.map((m) => m.user_id))
        .order('name');

      setGentlemen(profiles ?? []);
    }

    // Reset form
    setSelectedSession('');
    setSelectedGentleman('');
    setEngagement('');
    setParticipation('');
    setBehaviors({});
    setSelectedFlags(new Set());
    setNotes('');
    setError(null);
  }

  if (!open) return null;

  function toggleBehavior(b: string) {
    setBehaviors((prev) => {
      const current = prev[b];
      const next = current === 'yes' ? 'no' : current === 'no' ? 'na' : 'yes';
      return { ...prev, [b]: next };
    });
  }

  function toggleFlag(key: string) {
    setSelectedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (!selectedSession) { setError('Select a session.'); return; }
    if (!selectedGentleman) { setError('Select a gentleman.'); return; }

    setSaving(true);
    setError(null);

    const flagArray = Array.from(selectedFlags).map((key) => {
      const opt = FLAG_OPTIONS.find((f) => f.key === key);
      return { type: key, severity: opt?.severity ?? 'yellow' };
    });

    const { error: dbError } = await supabase.from('coach_observations').insert({
      session_id: selectedSession,
      captain_id: user!.id,
      gentleman_id: selectedGentleman,
      engagement: engagement || null,
      participation: participation || null,
      behaviors,
      flags: flagArray,
      notes: notes.trim() || null,
    });

    if (dbError) {
      // Handle duplicate
      if (dbError.code === '23505') {
        setError('Observation already submitted for this gentleman in this session.');
      } else {
        setError(dbError.message);
      }
      setSaving(false);
      return;
    }

    // Create flag records if any concern/escalation flags
    for (const flag of flagArray) {
      if (flag.type !== 'breakthrough') {
        await supabase.from('flags').insert({
          user_id: selectedGentleman,
          flag_type: flag.type,
          severity: flag.severity,
          trigger_data: { session_id: selectedSession, captain_id: user!.id, notes: notes.trim() },
        });
      }
    }

    setSaving(false);
    onSubmitted();
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-xl">Coach Observation</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Session">
            <select className="input" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
              <option value="">Select session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title ?? `Session ${s.session_number}`} — {new Date(s.scheduled_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Gentleman">
            <select className="input" value={selectedGentleman} onChange={(e) => setSelectedGentleman(e.target.value)}>
              <option value="">Select gentleman…</option>
              {gentlemen.map((g) => (
                <option key={g.id} value={g.id}>{g.name ?? 'Unnamed'}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Engagement">
            <select className="input" value={engagement} onChange={(e) => setEngagement(e.target.value as EngagementLevel)}>
              <option value="">—</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
              <option value="disengaged">Disengaged</option>
            </select>
          </Field>

          <Field label="Participation">
            <select className="input" value={participation} onChange={(e) => setParticipation(e.target.value as ParticipationQuality)}>
              <option value="">—</option>
              <option value="leading">Leading</option>
              <option value="contributing">Contributing</option>
              <option value="present">Present</option>
              <option value="passive">Passive</option>
            </select>
          </Field>
        </div>

        {/* Leadership Behaviors */}
        <Field label="Leadership Behaviors">
          <div className="space-y-1 rounded-md border border-ink-line bg-ink p-2">
            {BEHAVIORS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => toggleBehavior(b)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-ink-soft"
              >
                <span className="text-slate-300">{b}</span>
                <span className={`text-xs font-medium ${
                  behaviors[b] === 'yes' ? 'text-emerald-400' : behaviors[b] === 'no' ? 'text-red-400' : 'text-slate-600'
                }`}>
                  {behaviors[b] === 'yes' ? 'Y' : behaviors[b] === 'no' ? 'N' : 'N/A'}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {/* Flags */}
        <Field label="Flags">
          <div className="flex flex-wrap gap-2">
            {FLAG_OPTIONS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleFlag(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedFlags.has(f.key)
                    ? f.severity === 'positive'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : f.severity === 'red'
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
                    : 'border-ink-line text-slate-500 hover:border-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes">
          <textarea
            className="input min-h-[80px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Specific observations, context, or recommended actions…"
          />
        </Field>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Observation'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 py-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-ink-line bg-ink-soft p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
