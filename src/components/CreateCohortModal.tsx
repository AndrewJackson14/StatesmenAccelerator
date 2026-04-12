import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateCohortModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required.'); return; }

    setSaving(true);
    setError(null);

    const { data: cohort, error: dbError } = await supabase.from('cohorts').insert({
      name: name.trim(),
      start_date: startDate || null,
      end_date: endDate || null,
      max_capacity: maxCapacity,
      status: 'upcoming',
    }).select().single();

    setSaving(false);

    if (dbError || !cohort) {
      setError(dbError?.message ?? 'Failed to create cohort.');
      return;
    }

    // Log audit
    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: 'cohort_created',
      entity_type: 'cohort',
      entity_id: cohort.id,
      details: { name: name.trim() },
    });

    setName('');
    setStartDate('');
    setEndDate('');
    setMaxCapacity(30);
    onCreated();
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-xl">Create Cohort</h2>

        <Field label="Cohort Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alpha Cohort" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start Date">
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End Date">
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Max Capacity">
          <input className="input" type="number" min={1} max={100} value={maxCapacity} onChange={(e) => setMaxCapacity(Number(e.target.value))} />
        </Field>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Cohort'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-ink-line bg-ink-soft p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
