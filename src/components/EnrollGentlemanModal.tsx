import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CohortRow, ProfileRow } from '@/types/database';

interface Props {
  open: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export default function EnrollGentlemanModal({ open, onClose, onEnrolled }: Props) {
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [selectedCohort, setSelectedCohort] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  useEffect(() => {
    if (selectedCohort) loadEnrolled();
  }, [selectedCohort]);

  async function loadData() {
    const [{ data: cohortData }, { data: profileData }] = await Promise.all([
      supabase.from('cohorts').select('*').in('status', ['upcoming', 'active']).order('name'),
      supabase.from('profiles').select('*').eq('role', 'gentleman').order('name'),
    ]);
    setCohorts(cohortData ?? []);
    setProfiles(profileData ?? []);
    setSelectedUsers(new Set());
    setError(null);
  }

  async function loadEnrolled() {
    const { data } = await supabase
      .from('cohort_members')
      .select('user_id')
      .eq('cohort_id', selectedCohort);
    setEnrolledIds(new Set(data?.map((d) => d.user_id) ?? []));
  }

  if (!open) return null;

  function toggleUser(id: string) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEnroll() {
    if (!selectedCohort) { setError('Select a cohort.'); return; }
    if (selectedUsers.size === 0) { setError('Select at least one gentleman.'); return; }

    setSaving(true);
    setError(null);

    const inserts = Array.from(selectedUsers).map((user_id) => ({
      cohort_id: selectedCohort,
      user_id,
      role: 'gentleman' as const,
    }));

    const { error: dbError } = await supabase.from('cohort_members').upsert(inserts, { onConflict: 'cohort_id,user_id' });

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    await supabase.from('audit_log').insert({
      action: 'gentlemen_enrolled',
      entity_type: 'cohort',
      entity_id: selectedCohort,
      details: { user_ids: Array.from(selectedUsers) },
    });

    setSaving(false);
    setSelectedUsers(new Set());
    onEnrolled();
    onClose();
  }

  const available = profiles.filter((p) => !enrolledIds.has(p.id));

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-xl">Enroll Gentlemen</h2>

        <Field label="Cohort">
          <select className="input" value={selectedCohort} onChange={(e) => setSelectedCohort(e.target.value)}>
            <option value="">Select cohort…</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
            ))}
          </select>
        </Field>

        {selectedCohort && (
          <Field label={`Available Gentlemen (${available.length})`}>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-ink-line bg-ink p-2">
              {available.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-500">All gentlemen already enrolled.</div>
              ) : (
                available.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-ink-soft">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(p.id)}
                      onChange={() => toggleUser(p.id)}
                      className="accent-brass"
                    />
                    <span className="text-sm text-slate-200">{p.name ?? p.email ?? 'Unnamed'}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
        )}

        {selectedUsers.size > 0 && (
          <div className="text-xs text-slate-400">{selectedUsers.size} selected</div>
        )}

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleEnroll} disabled={saving || selectedUsers.size === 0}>
            {saving ? 'Enrolling…' : `Enroll ${selectedUsers.size || ''}`}
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
