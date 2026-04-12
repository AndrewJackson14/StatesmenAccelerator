import { useState, useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import AssessmentRenderer from '@/components/AssessmentRenderer';
import type { OnboardingStep, AssessmentTemplateRow, AssessmentInstanceRow } from '@/types/database';

const STEPS: { key: OnboardingStep; label: string; description: string }[] = [
  { key: 'account_created', label: 'Account Created', description: 'Your account is set up.' },
  { key: 'profile_setup', label: 'Profile Setup', description: 'Tell us about yourself.' },
  { key: 'intake_assessments', label: 'Intake Assessments', description: 'Complete your baseline assessments.' },
  { key: 'expectations_acknowledged', label: 'Expectations', description: 'Review and acknowledge the program expectations.' },
  { key: 'walkthrough_complete', label: 'Platform Tour', description: 'Quick tour of the platform.' },
  { key: 'squad_assigned', label: 'Squad Assignment', description: 'You\'ll be assigned to a squad.' },
  { key: 'complete', label: 'Ready', description: 'You\'re all set.' },
];

const STEP_ORDER: OnboardingStep[] = STEPS.map((s) => s.key);

export default function OnboardingFlow() {
  const { profile, user, refreshProfile } = useAuth();
  const uid = user?.id;
  const currentStep = profile?.onboarding_step ?? 'account_created';
  const stepIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-10">
      <div className="text-center">
        <h1 className="font-serif text-3xl text-brass">Welcome to Statesmen Accelerator</h1>
        <p className="mt-2 text-sm text-slate-400">Complete each step to unlock your dashboard.</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full transition ${i <= stepIndex ? 'bg-brass' : 'bg-ink-line'}`} />
            <span className={`text-xs ${i <= stepIndex ? 'text-brass' : 'text-slate-600'}`}>{i + 1}</span>
          </div>
        ))}
      </div>

      {/* Current step content */}
      <div className="card">
        {currentStep === 'account_created' && <StepAccountCreated uid={uid!} onNext={refreshProfile} />}
        {currentStep === 'profile_setup' && <StepProfileSetup uid={uid!} onNext={refreshProfile} />}
        {currentStep === 'intake_assessments' && <StepIntakeAssessments uid={uid!} onNext={refreshProfile} />}
        {currentStep === 'expectations_acknowledged' && <StepExpectations uid={uid!} onNext={refreshProfile} />}
        {currentStep === 'walkthrough_complete' && <StepWalkthrough uid={uid!} onNext={refreshProfile} />}
        {currentStep === 'squad_assigned' && <StepSquadAssigned uid={uid!} onNext={refreshProfile} />}
      </div>
    </div>
  );
}

// ── Step 1: Account Created → advance to profile_setup ──

function StepAccountCreated({ uid, onNext }: { uid: string; onNext: () => void }) {
  async function advance() {
    await supabase.from('profiles').update({ onboarding_step: 'profile_setup' }).eq('id', uid);
    onNext();
  }

  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Account Created</div>
      <p className="text-sm text-slate-400">Your account is ready. Let's set up your profile.</p>
      <button className="btn-primary" onClick={advance}>Continue</button>
    </div>
  );
}

// ── Step 2: Profile Setup ──

function StepProfileSetup({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    const { error: dbErr } = await supabase.from('profiles').update({
      name: name.trim(),
      age: age ? parseInt(age) : null,
      location: location.trim() || null,
      phone: phone.trim() || null,
      onboarding_step: 'intake_assessments',
    }).eq('id', uid);
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Set Up Your Profile</div>
      <Field label="Full Name *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Age">
          <input className="input" type="number" min={14} max={99} value={age} onChange={(e) => setAge(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Location">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" />
      </Field>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save & Continue'}</button>
    </div>
  );
}

// ── Step 3: Intake Assessments ──

function StepIntakeAssessments({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [templates, setTemplates] = useState<AssessmentTemplateRow[]>([]);
  const [instances, setInstances] = useState<AssessmentInstanceRow[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [activeTemplate, setActiveTemplate] = useState<AssessmentTemplateRow | null>(null);
  const [activeInstance, setActiveInstance] = useState<AssessmentInstanceRow | null>(null);
  const [loading, setLoading] = useState(true);

  const INTAKE_TYPES = ['resolve_scale', 'efficacy_index', 'mental_health_screen'];

  useEffect(() => { loadIntake(); }, []);

  async function loadIntake() {
    setLoading(true);
    // Get intake templates
    const { data: tmpl } = await supabase.from('assessment_templates').select('*').in('type', INTAKE_TYPES);
    setTemplates(tmpl ?? []);

    // Get user's cohort
    const { data: membership } = await supabase.from('cohort_members').select('cohort_id').eq('user_id', uid).limit(1).maybeSingle();

    if (membership && tmpl) {
      // Get or create instances for this cohort
      const { data: existing } = await supabase.from('assessment_instances').select('*').eq('cohort_id', membership.cohort_id).in('template_id', tmpl.map((t) => t.id));

      let instanceList = existing ?? [];

      // Create missing instances
      for (const t of tmpl) {
        if (!instanceList.find((i) => i.template_id === t.id)) {
          const { data: newInst } = await supabase.from('assessment_instances').insert({ template_id: t.id, cohort_id: membership.cohort_id, status: 'open' }).select().single();
          if (newInst) instanceList.push(newInst);
        }
      }
      setInstances(instanceList);

      // Check completed
      const { data: responses } = await supabase.from('assessment_responses').select('instance_id').eq('user_id', uid).not('submitted_at', 'is', null);
      setCompleted(new Set(responses?.map((r) => r.instance_id) ?? []));
    }
    setLoading(false);
  }

  async function handleComplete() {
    await loadIntake();
    setActiveTemplate(null);
    setActiveInstance(null);
  }

  if (activeTemplate && activeInstance) {
    return <AssessmentRenderer template={activeTemplate} instance={activeInstance} onComplete={handleComplete} onCancel={() => { setActiveTemplate(null); setActiveInstance(null); }} />;
  }

  const allDone = templates.length > 0 && instances.length > 0 && instances.every((i) => completed.has(i.id));

  async function advance() {
    await supabase.from('profiles').update({ onboarding_step: 'expectations_acknowledged' }).eq('id', uid);
    onNext();
  }

  if (loading) return <div className="py-8 text-center text-sm text-slate-500">Loading assessments…</div>;

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Intake Assessments</div>
      <p className="text-sm text-slate-400">Complete these baseline assessments before your program begins.</p>

      <div className="space-y-2">
        {templates.map((t) => {
          const inst = instances.find((i) => i.template_id === t.id);
          const done = inst ? completed.has(inst.id) : false;
          return (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3">
              <div>
                <div className="text-sm text-slate-100">{t.name}</div>
                <div className="text-xs text-slate-500">{fmtType(t.type)}</div>
              </div>
              {done ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">✓ Done</span>
              ) : inst ? (
                <button className="btn-primary text-xs" onClick={() => { setActiveTemplate(t); setActiveInstance(inst); }}>Start</button>
              ) : (
                <span className="text-xs text-slate-500">Not available</span>
              )}
            </div>
          );
        })}
      </div>

      {allDone && <button className="btn-primary w-full" onClick={advance}>Continue</button>}
    </div>
  );
}

// ── Step 4: Expectations ──

function StepExpectations({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  async function advance() {
    setSaving(true);
    await supabase.from('profiles').update({ onboarding_step: 'walkthrough_complete' }).eq('id', uid);
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Program Expectations</div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-ink-line bg-ink p-4 text-sm text-slate-300 leading-relaxed">
        <p className="mb-3">As a Gentleman in Statesmen Accelerator, you commit to:</p>
        <p className="mb-2"><strong className="text-slate-100">Attendance:</strong> Maintain at least 75% live session attendance. Communicate absences in advance.</p>
        <p className="mb-2"><strong className="text-slate-100">Engagement:</strong> Complete weekly pulse checks, participate actively in sessions, and engage with your squad.</p>
        <p className="mb-2"><strong className="text-slate-100">Integrity:</strong> Be honest in all assessments and interactions. The program rewards genuine engagement, not performance.</p>
        <p className="mb-2"><strong className="text-slate-100">Accountability:</strong> Complete weekly challenges, meet deadlines, and take ownership of your growth.</p>
        <p className="mb-2"><strong className="text-slate-100">Respect:</strong> Maintain confidentiality within the program. Treat all members with dignity.</p>
        <p><strong className="text-slate-100">Capstone:</strong> Submit your personal project by Week 13.</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="accent-brass" />
        <span className="text-sm text-slate-300">I have read and agree to the program expectations.</span>
      </label>
      <button className="btn-primary w-full" onClick={advance} disabled={!acknowledged || saving}>{saving ? 'Saving…' : 'I Acknowledge'}</button>
    </div>
  );
}

// ── Step 5: Walkthrough ──

function StepWalkthrough({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [step, setStep] = useState(0);
  const tour = [
    { title: 'Dashboard', desc: 'Your home base. See your pulse trend, leadership score, challenge progress, and squad standing at a glance.' },
    { title: 'Sessions', desc: 'Access your live and upcoming sessions. Activities unlock progressively during each session.' },
    { title: 'Assessments', desc: 'Complete weekly pulse checks and periodic assessments. Your growth is tracked automatically.' },
    { title: 'Messages', desc: 'Direct message your Captain or Headmaster. Squad and cohort chats keep you connected.' },
    { title: 'Profile', desc: 'Your personal profile, purpose statement, and progress — all in one place.' },
  ];

  async function finish() {
    await supabase.from('profiles').update({ onboarding_step: 'squad_assigned' }).eq('id', uid);
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Platform Tour</div>
      <div className="rounded-md border border-ink-line bg-ink p-4">
        <div className="mb-1 text-xs uppercase tracking-wider text-brass">{tour[step].title}</div>
        <div className="text-sm text-slate-300">{tour[step].desc}</div>
      </div>
      <div className="flex justify-center gap-1">
        {tour.map((_, i) => (
          <button key={i} onClick={() => setStep(i)} className={`h-2 w-2 rounded-full ${i === step ? 'bg-brass' : 'bg-ink-line'}`} />
        ))}
      </div>
      <div className="flex justify-between">
        <button className="btn text-xs" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</button>
        {step < tour.length - 1 ? (
          <button className="btn text-xs" onClick={() => setStep((s) => s + 1)}>Next →</button>
        ) : (
          <button className="btn-primary text-xs" onClick={finish}>Finish Tour</button>
        )}
      </div>
    </div>
  );
}

// ── Step 6: Squad Assigned (waiting state) ──

function StepSquadAssigned({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [assigned, setAssigned] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => { checkAssignment(); }, []);

  async function checkAssignment() {
    const { data } = await supabase.from('squad_members').select('squad_id').eq('user_id', uid).is('removed_at', null).limit(1).maybeSingle();
    if (data) {
      setAssigned(true);
      await supabase.from('profiles').update({ onboarding_step: 'complete', onboarding_complete: true }).eq('id', uid);
    }
    setChecking(false);
  }

  if (checking) return <div className="py-8 text-center text-sm text-slate-500">Checking squad assignment…</div>;

  if (assigned) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-lg font-serif text-emerald-400">You've been assigned to a squad!</div>
        <p className="text-sm text-slate-400">You're ready to begin.</p>
        <button className="btn-primary" onClick={onNext}>Enter the Academy</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Awaiting Squad Assignment</div>
      <p className="text-sm text-slate-400">Your Headmaster will assign you to a squad before your first session. Check back soon.</p>
      <button className="btn text-xs" onClick={checkAssignment}>Check Again</button>
    </div>
  );
}

// ── Shared ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function fmtType(type: string) { return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
