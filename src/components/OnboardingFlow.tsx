import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import AssessmentRenderer from '@/components/AssessmentRenderer';
import { loadApplicationState, setApplicationStatus } from '@/lib/application';
import { currentStep, STEP_LABEL, PRICE_LABEL, type PipelineStep, type ApplicationState } from '@/lib/pipeline';
import type { AssessmentTemplateRow, AssessmentInstanceRow } from '@/types/database';

// Visual progress bar — subset of steps we show as milestones.
const MILESTONE_STEPS: PipelineStep[] = [
  'profile_setup',
  'pdp_payment',
  'intake_assessments',
  'awaiting_review',
  'schedule_interview',
  'awaiting_decision',
  'pay_full_fee',
  'expectations',
  'walkthrough',
  'squad_pending',
  'active',
];

export default function OnboardingFlow() {
  const { user, refreshProfile } = useAuth();
  const uid = user?.id;
  const [state, setState] = useState<ApplicationState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const next = await loadApplicationState(uid);
    setState(next);
    setLoading(false);
    await refreshProfile();
  }, [uid, refreshProfile]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !state || !uid) {
    return (
      <div className="flex h-full items-center justify-center py-20 text-sm text-slate-500">
        Loading your application…
      </div>
    );
  }

  const step = currentStep(state);
  const milestoneIndex = MILESTONE_STEPS.indexOf(step);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-10">
      <div className="text-center">
        <h1 className="font-serif text-3xl text-brass">Welcome to Statesmen Accelerator</h1>
        <p className="mt-2 text-sm text-slate-400">{STEP_LABEL[step]}</p>
      </div>

      {/* Progress — hide for terminal states */}
      {step !== 'declined' && step !== 'on_hold' && (
        <div className="flex items-center gap-0.5">
          {MILESTONE_STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition ${
                i <= milestoneIndex ? 'bg-brass' : 'bg-ink-line'
              }`}
              title={STEP_LABEL[s]}
            />
          ))}
        </div>
      )}

      {/* Active step content */}
      <div className="card">
        <StepDispatch step={step} uid={uid} onChanged={load} />
      </div>
    </div>
  );
}

function StepDispatch({ step, uid, onChanged }: { step: PipelineStep; uid: string; onChanged: () => void }) {
  switch (step) {
    case 'profile_setup':
      return <StepProfileSetup uid={uid} onNext={onChanged} />;
    case 'pdp_payment':
      return <StepPdpPayment uid={uid} onNext={onChanged} />;
    case 'intake_assessments':
      return <StepIntakeAssessments uid={uid} onNext={onChanged} />;
    case 'awaiting_review':
      return <StepAwaitingReview />;
    case 'schedule_interview':
      return <StepScheduleInterview uid={uid} onNext={onChanged} />;
    case 'interview_confirmed':
      return <StepInterviewConfirmed uid={uid} />;
    case 'awaiting_decision':
      return <StepAwaitingDecision />;
    case 'pay_deposit':
      return <StepPayFee uid={uid} tier="deposit" onNext={onChanged} />;
    case 'pay_full_fee':
      return <StepPayFee uid={uid} tier="full" onNext={onChanged} />;
    case 'expectations':
      return <StepExpectations uid={uid} onNext={onChanged} />;
    case 'walkthrough':
      return <StepWalkthrough uid={uid} onNext={onChanged} />;
    case 'squad_pending':
      return <StepSquadPending uid={uid} onNext={onChanged} />;
    case 'on_hold':
      return <StepOnHold />;
    case 'declined':
      return <StepDeclined />;
    case 'active':
      return <StepActive onEnter={onChanged} />;
    default:
      return null;
  }
}

// ============================================================
// STEP: Profile Setup
// ============================================================

function StepProfileSetup({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (phone.trim() && !smsOptIn) {
      setError('Please check the SMS consent box or leave phone blank.');
      return;
    }
    setSaving(true);
    const updates: Record<string, unknown> = {
      name: name.trim(),
      age: age ? parseInt(age) : null,
      location: location.trim() || null,
      phone: phone.trim() || null,
      onboarding_step: 'profile_setup',
    };
    if (phone.trim() && smsOptIn) {
      updates.sms_opt_in = true;
      updates.sms_opt_in_at = new Date().toISOString();
    }
    const { error: dbErr } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', uid);
    setSaving(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Set up your profile</div>
      <p className="text-sm text-slate-400">
        Tell us who you are. This is the first step in your Personal Development Package.
      </p>
      <Field label="Full Name *">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Age">
          <input
            className="input"
            type="number"
            min={14}
            max={99}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Field>
        <Field label="Phone (for SMS reminders)">
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 555 5555"
          />
        </Field>
      </div>
      <Field label="Location">
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, State"
        />
      </Field>
      {phone.trim() && (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-ink-line bg-ink p-3">
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.target.checked)}
            className="mt-0.5 accent-brass"
          />
          <span className="text-xs text-slate-300">
            I agree to receive recurring SMS messages from Statesmen Accelerator at the number
            above, including session reminders, interview confirmations, assessment deadlines, and
            program updates. Message frequency varies. Message and data rates may apply. Reply
            STOP to opt out, HELP for help. See our{' '}
            <a href="/sms-opt-in" target="_blank" className="text-brass underline">
              SMS terms
            </a>
            .
          </span>
        </label>
      )}
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save & Continue'}
      </button>
    </div>
  );
}

// ============================================================
// STEP: PDP Payment ($49)
// ============================================================

function StepPdpPayment({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: Replace with real Stripe Checkout once VITE_STRIPE_PUBLISHABLE_KEY
  // and the create-checkout-session edge function are wired.
  async function handleMockPay() {
    setBusy(true);
    setError(null);

    // Create the payment record
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        user_id: uid,
        amount_cents: 4900,
        currency: 'usd',
        purpose: 'pdp',
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payErr || !payment) {
      setBusy(false);
      setError(payErr?.message ?? 'Payment failed.');
      return;
    }

    // Create the book shipment record (Headmaster will process)
    await supabase.from('book_shipments').insert({
      user_id: uid,
      purchased_at: new Date().toISOString(),
      status: 'pending',
    });

    // Enroll in Intake Pool so intake assessments have a cohort to attach to
    const { data: pool } = await supabase
      .from('cohorts')
      .select('id')
      .eq('name', 'Intake Pool')
      .maybeSingle();

    if (pool) {
      await supabase
        .from('cohort_members')
        .upsert(
          { cohort_id: pool.id, user_id: uid, role: 'gentleman' },
          { onConflict: 'cohort_id,user_id' },
        );
    }

    // Flip application status
    await setApplicationStatus(uid, 'pdp_purchased', {
      pdp_purchased_at: new Date().toISOString(),
    });

    setBusy(false);
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Personal Development Package</div>
      <div className="rounded-md border border-ink-line bg-ink p-4 text-sm text-slate-300">
        <div className="mb-3">
          The Personal Development Package includes:
        </div>
        <ul className="ml-4 list-disc space-y-1">
          <li>A printed copy of the Statesmen foundational book (mailed)</li>
          <li>The full intake assessment battery (Resolve, Efficacy, Mental Health)</li>
          <li>Your personal baseline report</li>
          <li>An invitation to interview for the next Accelerator cohort</li>
        </ul>
      </div>
      <div className="flex items-center justify-between rounded-md border border-brass/40 bg-brass/5 px-4 py-3">
        <div className="font-serif text-slate-100">One-time fee</div>
        <div className="font-serif text-2xl text-brass">{PRICE_LABEL.pdp}</div>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button className="btn-primary w-full" onClick={handleMockPay} disabled={busy}>
        {busy ? 'Processing…' : `Pay ${PRICE_LABEL.pdp} and begin`}
      </button>
      <p className="text-center text-xs text-slate-500">
        Secure payment via Stripe · Non-refundable · Your book ships within 5 business days
      </p>
    </div>
  );
}

// ============================================================
// STEP: Intake Assessments
// ============================================================

const INTAKE_TYPES = ['resolve_scale', 'efficacy_index', 'mental_health_screen'];

function StepIntakeAssessments({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [templates, setTemplates] = useState<AssessmentTemplateRow[]>([]);
  const [instances, setInstances] = useState<AssessmentInstanceRow[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [activeTemplate, setActiveTemplate] = useState<AssessmentTemplateRow | null>(null);
  const [activeInstance, setActiveInstance] = useState<AssessmentInstanceRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIntake();
  }, []);

  async function loadIntake() {
    setLoading(true);
    const { data: tmpl } = await supabase
      .from('assessment_templates')
      .select('*')
      .in('type', INTAKE_TYPES);
    setTemplates(tmpl ?? []);

    // Find the user's current cohort (should be Intake Pool unless Headmaster moved them)
    const { data: membership } = await supabase
      .from('cohort_members')
      .select('cohort_id')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();

    if (!membership || !tmpl) {
      setLoading(false);
      return;
    }

    // Get or create instances for this cohort
    const { data: existing } = await supabase
      .from('assessment_instances')
      .select('*')
      .eq('cohort_id', membership.cohort_id)
      .in('template_id', tmpl.map((t) => t.id));

    const instanceList = existing ?? [];

    for (const t of tmpl) {
      if (!instanceList.find((i) => i.template_id === t.id)) {
        const { data: newInst } = await supabase
          .from('assessment_instances')
          .insert({ template_id: t.id, cohort_id: membership.cohort_id, status: 'open' })
          .select()
          .single();
        if (newInst) instanceList.push(newInst);
      }
    }
    setInstances(instanceList);

    const { data: responses } = await supabase
      .from('assessment_responses')
      .select('instance_id')
      .eq('user_id', uid)
      .not('submitted_at', 'is', null);
    setCompleted(new Set(responses?.map((r) => r.instance_id) ?? []));
    setLoading(false);
  }

  async function handleComplete() {
    await loadIntake();
    setActiveTemplate(null);
    setActiveInstance(null);
  }

  if (activeTemplate && activeInstance) {
    return (
      <AssessmentRenderer
        template={activeTemplate}
        instance={activeInstance}
        onComplete={handleComplete}
        onCancel={() => {
          setActiveTemplate(null);
          setActiveInstance(null);
        }}
      />
    );
  }

  const allDone =
    templates.length > 0 && instances.length > 0 && instances.every((i) => completed.has(i.id));

  async function advance() {
    await setApplicationStatus(uid, 'assessments_done', {
      assessments_completed_at: new Date().toISOString(),
    });
    onNext();
  }

  if (loading) return <div className="py-8 text-center text-sm text-slate-500">Loading assessments…</div>;

  if (templates.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-lg font-serif text-slate-100">Intake Assessments</div>
        <p className="text-sm text-slate-400">
          No intake templates are configured yet. Please contact the Headmaster.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Intake Assessments</div>
      <p className="text-sm text-slate-400">
        Complete these three baseline assessments so we can understand where you're starting from.
      </p>
      <div className="space-y-2">
        {templates.map((t) => {
          const inst = instances.find((i) => i.template_id === t.id);
          const done = inst ? completed.has(inst.id) : false;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3"
            >
              <div>
                <div className="text-sm text-slate-100">{t.name}</div>
                <div className="text-xs text-slate-500">{fmtType(t.type)}</div>
              </div>
              {done ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                  ✓ Done
                </span>
              ) : inst ? (
                <button
                  className="btn-primary text-xs"
                  onClick={() => {
                    setActiveTemplate(t);
                    setActiveInstance(inst);
                  }}
                >
                  Start
                </button>
              ) : (
                <span className="text-xs text-slate-500">Loading…</span>
              )}
            </div>
          );
        })}
      </div>
      {allDone && (
        <button className="btn-primary w-full" onClick={advance}>
          Submit for Review
        </button>
      )}
    </div>
  );
}

// ============================================================
// STEP: Awaiting Review (after assessments, before interview invite)
// ============================================================

function StepAwaitingReview() {
  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Application Under Review</div>
      <p className="text-sm text-slate-400">
        Thank you for completing the intake battery. The Headmaster is reviewing your results and
        will be in touch shortly to schedule a 15-minute interview.
      </p>
      <div className="rounded-md border border-brass/40 bg-brass/5 p-3 text-xs text-brass">
        What happens next: you'll receive an email invitation with a link to choose an interview slot.
      </div>
    </div>
  );
}

// ============================================================
// STEP: Schedule Interview
// ============================================================

interface SlotRow {
  id: string;
  start_at: string;
  duration_min: number;
  webex_link: string | null;
  status: string;
}

function StepScheduleInterview({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSlots();
  }, []);

  async function loadSlots() {
    setLoading(true);
    const { data } = await supabase
      .from('interview_slots')
      .select('id, start_at, duration_min, webex_link, status')
      .eq('status', 'available')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true });
    setSlots(data ?? []);
    setLoading(false);
  }

  async function book(slotId: string) {
    setBooking(slotId);
    setError(null);

    // Find the application id
    const { data: app } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', uid)
      .single();

    if (!app) {
      setError('Application not found.');
      setBooking(null);
      return;
    }

    const { error: bookErr } = await supabase.from('interview_bookings').insert({
      slot_id: slotId,
      application_id: app.id,
      user_id: uid,
    });

    if (bookErr) {
      setError(bookErr.message);
      setBooking(null);
      return;
    }

    // Mark the slot as booked
    await supabase.from('interview_slots').update({ status: 'booked' }).eq('id', slotId);

    // Flip application status
    await setApplicationStatus(uid, 'interview_scheduled', {
      interview_scheduled_at: new Date().toISOString(),
    });

    setBooking(null);
    onNext();
  }

  if (loading) return <div className="py-8 text-center text-sm text-slate-500">Loading slots…</div>;

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Schedule Your Interview</div>
      <p className="text-sm text-slate-400">
        Choose a 15-minute slot that works for you. You'll receive a Webex link and a calendar
        reminder.
      </p>
      {slots.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-line py-6 text-center text-sm text-slate-500">
          No open slots right now. Check back soon — the Headmaster will add availability shortly.
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map((s) => (
            <button
              key={s.id}
              className="flex w-full items-center justify-between rounded-md border border-ink-line bg-ink px-4 py-3 text-left transition hover:border-brass/50 hover:bg-ink-soft"
              onClick={() => book(s.id)}
              disabled={booking !== null}
            >
              <div>
                <div className="text-sm text-slate-100">{fmtSlot(s.start_at)}</div>
                <div className="text-xs text-slate-500">{s.duration_min} min interview</div>
              </div>
              <span className="text-xs text-brass">
                {booking === s.id ? 'Booking…' : 'Book →'}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}

// ============================================================
// STEP: Interview Confirmed
// ============================================================

function StepInterviewConfirmed({ uid }: { uid: string }) {
  const [booking, setBooking] = useState<{ start_at: string; webex_link: string | null } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('interview_bookings')
        .select('slot_id, interview_slots(start_at, webex_link)')
        .eq('user_id', uid)
        .is('cancelled_at', null)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slot = (data as any)?.interview_slots;
      if (slot) setBooking({ start_at: slot.start_at, webex_link: slot.webex_link });
    })();
  }, [uid]);

  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-emerald-400">Interview Confirmed</div>
      {booking ? (
        <>
          <p className="text-sm text-slate-400">Your interview is scheduled for:</p>
          <div className="rounded-md border border-brass/40 bg-brass/5 p-4">
            <div className="font-serif text-lg text-slate-100">{fmtSlot(booking.start_at)}</div>
          </div>
          {booking.webex_link && (
            <a
              href={booking.webex_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex"
            >
              Open Webex Link
            </a>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-400">Loading your interview details…</p>
      )}
      <p className="text-xs text-slate-500">
        You'll receive a reminder SMS 24 hours before and 15 minutes before.
      </p>
    </div>
  );
}

// ============================================================
// STEP: Awaiting Decision (after interview held)
// ============================================================

function StepAwaitingDecision() {
  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Decision Pending</div>
      <p className="text-sm text-slate-400">
        Thank you for the interview. The Headmaster is reviewing your fit for the next cohort and
        will send a decision by email and SMS within 48 hours.
      </p>
    </div>
  );
}

// ============================================================
// STEP: Pay Fee (deposit $225 or full $450)
// ============================================================

function StepPayFee({
  uid,
  tier,
  onNext,
}: {
  uid: string;
  tier: 'deposit' | 'full';
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountCents = tier === 'deposit' ? 22500 : 45000;
  const amountLabel = tier === 'deposit' ? PRICE_LABEL.deposit : PRICE_LABEL.full;
  const title = tier === 'deposit' ? 'Reserve Your Spot' : 'Confirm Enrollment';
  const description =
    tier === 'deposit'
      ? 'You\'ve been approved and placed on the waitlist. Pay a $225 deposit now to hold your spot. When a cohort opens, the remaining $225 will be charged automatically.'
      : 'You\'ve been approved and assigned to a cohort. Pay the full $450 enrollment fee to confirm your spot.';

  // TODO: Replace with real Stripe Checkout.
  async function handleMockPay() {
    setBusy(true);
    setError(null);
    const { error: payErr } = await supabase.from('payments').insert({
      user_id: uid,
      amount_cents: amountCents,
      currency: 'usd',
      purpose: tier,
      status: 'paid',
      paid_at: new Date().toISOString(),
    });
    setBusy(false);
    if (payErr) {
      setError(payErr.message);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">{title}</div>
      <p className="text-sm text-slate-400">{description}</p>
      <div className="flex items-center justify-between rounded-md border border-brass/40 bg-brass/5 px-4 py-3">
        <div className="font-serif text-slate-100">
          {tier === 'deposit' ? 'Deposit' : 'Full enrollment'}
        </div>
        <div className="font-serif text-2xl text-brass">{amountLabel}</div>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button className="btn-primary w-full" onClick={handleMockPay} disabled={busy}>
        {busy ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
      <p className="text-center text-xs text-slate-500">Secure payment via Stripe</p>
    </div>
  );
}

// ============================================================
// STEP: Expectations
// ============================================================

function StepExpectations({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  async function advance() {
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ onboarding_step: 'expectations_acknowledged' })
      .eq('id', uid);
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-serif text-slate-100">Program Expectations</div>
      <div className="max-h-64 overflow-y-auto rounded-md border border-ink-line bg-ink p-4 text-sm leading-relaxed text-slate-300">
        <p className="mb-3">As a Gentleman in Statesmen Accelerator, you commit to:</p>
        <p className="mb-2">
          <strong className="text-slate-100">Attendance:</strong> Maintain at least 75% live session
          attendance. Communicate absences in advance.
        </p>
        <p className="mb-2">
          <strong className="text-slate-100">Engagement:</strong> Complete weekly pulse checks,
          participate actively in sessions, and engage with your squad.
        </p>
        <p className="mb-2">
          <strong className="text-slate-100">Integrity:</strong> Be honest in all assessments and
          interactions. The program rewards genuine engagement, not performance.
        </p>
        <p className="mb-2">
          <strong className="text-slate-100">Accountability:</strong> Complete weekly challenges,
          meet deadlines, and take ownership of your growth.
        </p>
        <p className="mb-2">
          <strong className="text-slate-100">Respect:</strong> Maintain confidentiality within the
          program. Treat all members with dignity.
        </p>
        <p>
          <strong className="text-slate-100">Capstone:</strong> Submit your personal project by
          Week 13.
        </p>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="accent-brass"
        />
        <span className="text-sm text-slate-300">
          I have read and agree to the program expectations.
        </span>
      </label>
      <button
        className="btn-primary w-full"
        onClick={advance}
        disabled={!acknowledged || saving}
      >
        {saving ? 'Saving…' : 'I Acknowledge'}
      </button>
    </div>
  );
}

// ============================================================
// STEP: Walkthrough
// ============================================================

function StepWalkthrough({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [step, setStep] = useState(0);
  const tour = [
    {
      title: 'Dashboard',
      desc: 'Your home base. See your pulse trend, leadership score, challenge progress, and squad standing at a glance.',
    },
    {
      title: 'Sessions',
      desc: 'Access your live and upcoming sessions. Activities unlock progressively during each session.',
    },
    {
      title: 'Assessments',
      desc: 'Complete weekly pulse checks and periodic assessments. Your growth is tracked automatically.',
    },
    {
      title: 'Messages',
      desc: 'Direct message your Captain or Headmaster. Squad and cohort chats keep you connected.',
    },
    {
      title: 'Profile',
      desc: 'Your personal profile, purpose statement, and progress — all in one place.',
    },
  ];

  async function finish() {
    await supabase
      .from('profiles')
      .update({ onboarding_step: 'walkthrough_complete' })
      .eq('id', uid);
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
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`h-2 w-2 rounded-full ${i === step ? 'bg-brass' : 'bg-ink-line'}`}
            aria-label={`Go to step ${i + 1}`}
          />
        ))}
      </div>
      <div className="flex justify-between">
        <button
          className="btn text-xs"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          ← Back
        </button>
        {step < tour.length - 1 ? (
          <button className="btn text-xs" onClick={() => setStep((s) => s + 1)}>
            Next →
          </button>
        ) : (
          <button className="btn-primary text-xs" onClick={finish}>
            Finish Tour
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP: Squad Pending
// ============================================================

function StepSquadPending({ uid, onNext }: { uid: string; onNext: () => void }) {
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const { data } = await supabase
      .from('squad_members')
      .select('squad_id')
      .eq('user_id', uid)
      .is('removed_at', null)
      .limit(1)
      .maybeSingle();
    if (data) {
      await supabase
        .from('profiles')
        .update({ onboarding_step: 'complete', onboarding_complete: true })
        .eq('id', uid);
      onNext();
    }
    setChecking(false);
  }

  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Awaiting Squad Assignment</div>
      <p className="text-sm text-slate-400">
        Your Headmaster will assign you to a squad before your first session. You'll be notified by
        email and SMS when it happens.
      </p>
      <button className="btn text-xs" onClick={check} disabled={checking}>
        {checking ? 'Checking…' : 'Check Again'}
      </button>
    </div>
  );
}

// ============================================================
// STEP: Active (flip onboarding_complete)
// ============================================================

function StepActive({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-emerald-400">Welcome to the Academy</div>
      <p className="text-sm text-slate-400">You're fully onboarded. Let's get to work.</p>
      <button className="btn-primary" onClick={onEnter}>
        Enter the Academy
      </button>
    </div>
  );
}

// ============================================================
// STEP: On Hold
// ============================================================

function StepOnHold() {
  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Application On Hold</div>
      <p className="text-sm text-slate-400">
        Your application is currently on hold. The Headmaster will revisit it and be in touch with
        an update.
      </p>
    </div>
  );
}

// ============================================================
// STEP: Declined
// ============================================================

function StepDeclined() {
  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-serif text-slate-100">Thank You for Applying</div>
      <p className="text-sm text-slate-400">
        After careful consideration, we've determined that the Accelerator isn't the right fit for
        you at this time. You keep full access to your Personal Development Package materials,
        including the book and your baseline report.
      </p>
      <p className="text-xs text-slate-500">
        You're welcome to reapply for a future cohort.
      </p>
    </div>
  );
}

// ============================================================
// Shared
// ============================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function fmtType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtSlot(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
