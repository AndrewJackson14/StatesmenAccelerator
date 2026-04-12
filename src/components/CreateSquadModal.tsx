import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CohortRow, ProfileRow, CohortPhase } from '@/types/database';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateSquadModal({ open, onClose, onCreated }: Props) {
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [selectedCohort, setSelectedCohort] = useState('');
  const [cohortMembers, setCohortMembers] = useState<ProfileRow[]>([]);
  const [squadName, setSquadName] = useState('');
  const [phase, setPhase] = useState<CohortPhase>('phase1');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [leaderId, setLeaderId] = useState('');
  const [deputyId, setDeputyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadCohorts();
  }, [open]);

  useEffect(() => {
    if (selectedCohort) loadMembers();
  }, [selectedCohort]);

  async function loadCohorts() {
    const { data } = await supabase.from('cohorts').select('*').in('status', ['upcoming', 'active']).order('name');
    setCohorts(data ?? []);
    setSelectedCohort('');
    setSquadName('');
    setSelectedMembers(new Set());
    setLeaderId('');
    setDeputyId('');
    setError(null);
  }

  async function loadMembers() {
    const { data: members } = await supabase
      .from('cohort_members')
      .select('user_id')
      .eq('cohort_id', selectedCohort)
      .eq('role', 'gentleman');

    if (!members || members.length === 0) { setCohortMembers([]); return; }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', members.map((m) => m.user_id))
      .order('name');

    setCohortMembers(profiles ?? []);
  }

  if (!open) return null;

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (leaderId === id) setLeaderId('');
        if (deputyId === id) setDeputyId('');
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!selectedCohort) { setError('Select a cohort.'); return; }
    if (!squadName.trim()) { setError('Squad name is required.'); return; }
    if (selectedMembers.size === 0) { setError('Select at least one member.'); return; }

    setSaving(true);
    setError(null);

    // Create squad
    const { data: squad, error: squadError } = await supabase
      .from('squads')
      .insert({ cohort_id: selectedCohort, name: squadName.trim(), phase })
      .select()
      .single();

    if (squadError || !squad) {
      setError(squadError?.message ?? 'Failed to create squad.');
      setSaving(false);
      return;
    }

    // Assign members
    const memberInserts = Array.from(selectedMembers).map((user_id) => ({
      squad_id: squad.id,
      user_id,
      role: user_id === leaderId ? 'leader' as const : user_id === deputyId ? 'deputy' as const : 'member' as const,
    }));

    const { error: memberError } = await supabase.from('squad_members').insert(memberInserts);

    if (memberError) {
      setError(memberError.message);
      setSaving(false);
      return;
    }

    // Create squad conversation
    const { data: convo } = await supabase
      .from('conversations')
      .insert({ type: 'squad', squad_id: squad.id, cohort_id: selectedCohort })
      .select()
      .single();

    if (convo) {
      const participantInserts = Array.from(selectedMembers).map((user_id) => ({
        conversation_id: convo.id,
        user_id,
      }));
      await supabase.from('conversation_participants').insert(participantInserts);
    }

    await supabase.from('audit_log').insert({
      action: 'squad_created',
      entity_type: 'squad',
      entity_id: squad.id,
      details: { name: squadName.trim(), members: Array.from(selectedMembers), leader: leaderId, deputy: deputyId },
    });

    setSaving(false);
    onCreated();
    onClose();
  }

  const selectedArray = Array.from(selectedMembers);

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-xl">Create Squad</h2>

        <Field label="Cohort">
          <select className="input" value={selectedCohort} onChange={(e) => setSelectedCohort(e.target.value)}>
            <option value="">Select cohort…</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Squad Name">
            <input className="input" value={squadName} onChange={(e) => setSquadName(e.target.value)} placeholder="e.g. Iron Squad" />
          </Field>
          <Field label="Phase">
            <select className="input" value={phase} onChange={(e) => setPhase(e.target.value as CohortPhase)}>
              <option value="phase1">Phase 1</option>
              <option value="phase2a">Phase 2a (Junior)</option>
              <option value="phase2b">Phase 2b (Senior)</option>
              <option value="phase3">Phase 3</option>
            </select>
          </Field>
        </div>

        {selectedCohort && (
          <Field label={`Members (${cohortMembers.length} available)`}>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-ink-line bg-ink p-2">
              {cohortMembers.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-500">No gentlemen enrolled in this cohort.</div>
              ) : (
                cohortMembers.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-ink-soft">
                    <input type="checkbox" checked={selectedMembers.has(p.id)} onChange={() => toggleMember(p.id)} className="accent-brass" />
                    <span className="text-sm text-slate-200">{p.name ?? 'Unnamed'}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
        )}

        {selectedArray.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Squad Leader">
              <select className="input" value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
                <option value="">None yet</option>
                {selectedArray.map((id) => {
                  const p = cohortMembers.find((m) => m.id === id);
                  return <option key={id} value={id}>{p?.name ?? 'Unnamed'}</option>;
                })}
              </select>
            </Field>
            <Field label="Deputy">
              <select className="input" value={deputyId} onChange={(e) => setDeputyId(e.target.value)}>
                <option value="">None yet</option>
                {selectedArray.filter((id) => id !== leaderId).map((id) => {
                  const p = cohortMembers.find((m) => m.id === id);
                  return <option key={id} value={id}>{p?.name ?? 'Unnamed'}</option>;
                })}
              </select>
            </Field>
          </div>
        )}

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving || selectedMembers.size === 0}>
            {saving ? 'Creating…' : 'Create Squad'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
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
