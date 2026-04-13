import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { sendSmsToUser, SMS } from '@/lib/sms';
import { sendEmailToUser, EMAIL } from '@/lib/email';
import type { ApplicationStatus } from '@/lib/pipeline';
import { STEP_LABEL, currentStep } from '@/lib/pipeline';

interface AppRow {
  id: string;
  user_id: string;
  status: ApplicationStatus;
  submitted_at: string;
  pdp_purchased_at: string | null;
  assessments_completed_at: string | null;
  interview_invited_at: string | null;
  interview_scheduled_at: string | null;
  interview_held_at: string | null;
  interview_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_sms_sent_at: string | null;
  target_cohort_id: string | null;
}

interface ProfileRow {
  name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  location: string | null;
  photo_url: string | null;
  sms_opt_in: boolean;
}

interface AssessmentItem {
  id: string;
  text: string;
  reversed?: boolean;
  subscale?: string;
  scale?: string;
}

interface ResponseRow {
  id: string;
  instance_id: string;
  user_id: string;
  responses: Record<string, number | string>;
  score: number | null;
  subscores: Record<string, number> | null;
  submitted_at: string | null;
  template_name: string;
  template_type: string;
  template_items: AssessmentItem[];
}

interface FlagRow {
  id: string;
  flag_type: string;
  severity: 'yellow' | 'red' | 'positive';
  triggered_at: string;
  trigger_data: Record<string, unknown> | null;
}

interface CohortOption {
  id: string;
  name: string;
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [app, setApp] = useState<AppRow | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [chosenCohort, setChosenCohort] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (id) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadAll() {
    if (!id) return;
    setLoading(true);

    const { data: appData } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!appData) {
      setLoading(false);
      return;
    }
    setApp(appData as AppRow);
    setNotes(appData.interview_notes ?? '');

    const [{ data: profileData }, { data: cohortData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, email, phone, age, location, photo_url, sms_opt_in')
        .eq('id', appData.user_id)
        .maybeSingle(),
      supabase
        .from('cohorts')
        .select('id, name')
        .neq('name', 'Intake Pool')
        .in('status', ['upcoming', 'active'])
        .order('name'),
    ]);
    setProfile(profileData);
    setCohorts(cohortData ?? []);

    const { data: responseData } = await supabase
      .from('assessment_responses')
      .select(
        'id, instance_id, user_id, responses, score, subscores, submitted_at, assessment_instances(template_id, assessment_templates(name, type, items))',
      )
      .eq('user_id', appData.user_id)
      .not('submitted_at', 'is', null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flattened: ResponseRow[] = ((responseData as any[]) ?? []).map((r) => {
      const inst = Array.isArray(r.assessment_instances) ? r.assessment_instances[0] : r.assessment_instances;
      const tmpl = Array.isArray(inst?.assessment_templates) ? inst.assessment_templates[0] : inst?.assessment_templates;
      return {
        id: r.id,
        instance_id: r.instance_id,
        user_id: r.user_id,
        responses: r.responses ?? {},
        score: r.score,
        subscores: r.subscores,
        submitted_at: r.submitted_at,
        template_name: tmpl?.name ?? 'Unknown',
        template_type: tmpl?.type ?? 'unknown',
        template_items: (tmpl?.items ?? []) as AssessmentItem[],
      };
    });
    setResponses(flattened);

    const { data: flagData } = await supabase
      .from('flags')
      .select('id, flag_type, severity, triggered_at, trigger_data')
      .eq('user_id', appData.user_id)
      .order('triggered_at', { ascending: false });
    setFlags((flagData as FlagRow[]) ?? []);

    setLoading(false);
  }

  async function inviteToInterview() {
    if (!app) return;
    setActing(true);
    await supabase
      .from('applications')
      .update({
        status: 'interview_invited',
        interview_invited_at: new Date().toISOString(),
        interview_notes: notes || null,
      })
      .eq('id', app.id);
    const firstName = profile?.name?.split(' ')[0];
    const emailTmpl = EMAIL.interviewInvite(firstName);
    await Promise.all([
      sendSmsToUser(app.user_id, SMS.interviewInvite()),
      sendEmailToUser(app.user_id, emailTmpl.subject, emailTmpl.html),
    ]);
    setActing(false);
    loadAll();
  }

  async function markInterviewHeld() {
    if (!app) return;
    setActing(true);
    await supabase
      .from('applications')
      .update({
        status: 'interview_held',
        interview_held_at: new Date().toISOString(),
        interview_notes: notes || null,
      })
      .eq('id', app.id);
    setActing(false);
    loadAll();
  }

  async function decide(
    decision: 'approved_confirmed' | 'approved_waitlisted' | 'declined' | 'on_hold',
  ) {
    if (!app) return;
    setActing(true);

    const updates: Record<string, unknown> = {
      status: decision,
      decided_by: user?.id,
      decided_at: new Date().toISOString(),
      interview_notes: notes || null,
    };
    if (decision === 'approved_confirmed' && chosenCohort) {
      updates.target_cohort_id = chosenCohort;
    }

    await supabase.from('applications').update(updates).eq('id', app.id);

    if (decision === 'approved_confirmed' && chosenCohort) {
      // Remove from Intake Pool (if present) and add to the real cohort.
      const { data: pool } = await supabase
        .from('cohorts')
        .select('id')
        .eq('name', 'Intake Pool')
        .maybeSingle();
      if (pool) {
        await supabase
          .from('cohort_members')
          .delete()
          .eq('user_id', app.user_id)
          .eq('cohort_id', pool.id);
      }
      await supabase.from('cohort_members').upsert(
        { cohort_id: chosenCohort, user_id: app.user_id, role: 'gentleman' },
        { onConflict: 'cohort_id,user_id' },
      );
    }

    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: `application_${decision}`,
      entity_type: 'application',
      entity_id: app.id,
      details: { target_cohort_id: chosenCohort || null, applicant: profile?.name },
    });

    const smsBody =
      decision === 'approved_confirmed'
        ? SMS.approvedConfirmed()
        : decision === 'approved_waitlisted'
        ? SMS.approvedWaitlisted()
        : decision === 'declined'
        ? SMS.declined()
        : SMS.onHold();
    const emailTmpl =
      decision === 'approved_confirmed'
        ? EMAIL.approvedConfirmed()
        : decision === 'approved_waitlisted'
        ? EMAIL.approvedWaitlisted()
        : decision === 'declined'
        ? EMAIL.declined()
        : EMAIL.onHold();
    await Promise.all([
      sendSmsToUser(app.user_id, smsBody),
      sendEmailToUser(app.user_id, emailTmpl.subject, emailTmpl.html),
    ]);

    await supabase
      .from('applications')
      .update({
        decision_sms_sent_at: new Date().toISOString(),
        decision_email_sent_at: new Date().toISOString(),
      })
      .eq('id', app.id);

    setActing(false);
    loadAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Loading application…
      </div>
    );
  }

  if (!app || !profile) {
    return (
      <div className="card space-y-2">
        <div className="text-lg">Application not found</div>
        <Link to="/headmaster/applications" className="text-sm text-brass hover:underline">
          ← Back to queue
        </Link>
      </div>
    );
  }

  const step = currentStep({
    status: app.status,
    profileComplete: true,
    intakeDone: !!app.assessments_completed_at,
    interviewBooked: !!app.interview_scheduled_at,
    feePaid: false,
    expectationsAck: false,
    walkthroughDone: false,
    squadAssigned: false,
    targetCohortId: app.target_cohort_id,
  });

  return (
    <div className="space-y-8">
      {/* Back link + header */}
      <div>
        <Link
          to="/headmaster/applications"
          className="text-xs text-slate-500 hover:text-brass"
        >
          ← Applications
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl">{profile.name ?? 'Unnamed Candidate'}</h1>
            <div className="mt-1 text-sm text-slate-400">
              {profile.email}
              {profile.phone && ` · ${profile.phone}`}
              {profile.sms_opt_in && (
                <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                  SMS OK
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={app.status} />
        </div>
        <div className="mt-2 text-xs text-brass">
          Current step: {STEP_LABEL[step]}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: profile + timeline */}
        <div className="space-y-6">
          <Section title="Profile">
            <Row label="Age" value={profile.age ?? '—'} />
            <Row label="Location" value={profile.location ?? '—'} />
            <Row label="Phone" value={profile.phone ?? '—'} />
            <Row label="SMS consent" value={profile.sms_opt_in ? 'Yes' : 'No'} />
          </Section>

          <Section title="Timeline">
            <TimelineRow label="Signed up" at={app.submitted_at} />
            <TimelineRow label="Intake completed" at={app.assessments_completed_at} />
            <TimelineRow label="Interview invited" at={app.interview_invited_at} />
            <TimelineRow label="Interview scheduled" at={app.interview_scheduled_at} />
            <TimelineRow label="Interview held" at={app.interview_held_at} />
            <TimelineRow label="Decision" at={app.decided_at} />
            <TimelineRow label="Decision SMS sent" at={app.decision_sms_sent_at} />
          </Section>

          {flags.length > 0 && (
            <Section title={`Flags (${flags.length})`}>
              <div className="space-y-2">
                {flags.map((f) => (
                  <div
                    key={f.id}
                    className={`rounded-md border px-3 py-2 text-xs ${
                      f.severity === 'red'
                        ? 'border-red-500/30 bg-red-500/5 text-red-400'
                        : f.severity === 'positive'
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                        : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400'
                    }`}
                  >
                    <div className="font-medium">{f.flag_type.replace(/_/g, ' ')}</div>
                    <div className="mt-0.5 text-slate-500">
                      {new Date(f.triggered_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Right column (2/3): assessments + actions */}
        <div className="space-y-6 lg:col-span-2">
          <Section title="Assessment Results">
            {responses.length === 0 ? (
              <Empty message="No assessments completed yet." />
            ) : (
              <div className="space-y-4">
                {responses.map((r) => (
                  <AssessmentReviewCard key={r.id} response={r} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Interview Notes">
            <textarea
              className="input min-h-[100px] text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes captured during the interview, or pre-interview observations…"
            />
          </Section>

          <Section title="Actions">
            <ActionPanel
              status={app.status}
              chosenCohort={chosenCohort}
              onCohortChange={setChosenCohort}
              cohorts={cohorts}
              acting={acting}
              onInvite={inviteToInterview}
              onMarkHeld={markInterviewHeld}
              onDecide={decide}
              onBack={() => navigate('/headmaster/applications')}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function AssessmentReviewCard({ response }: { response: ResponseRow }) {
  const [expanded, setExpanded] = useState(false);
  const items = response.template_items ?? [];
  const subscores = response.subscores ?? {};

  return (
    <div className="rounded-md border border-ink-line bg-ink">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ink-soft"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <div className="text-sm font-medium text-slate-100">{response.template_name}</div>
          <div className="text-xs text-slate-500">
            {fmtType(response.template_type)} ·{' '}
            {response.submitted_at && new Date(response.submitted_at).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-500">Score</div>
            <div className="font-serif text-xl text-brass">
              {response.score !== null ? response.score : '—'}
            </div>
          </div>
          <span className="text-slate-500">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-ink-line px-4 py-3">
          {/* Subscores */}
          {Object.keys(subscores).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(subscores).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-md bg-ink-soft px-3 py-2"
                >
                  <span className="text-xs uppercase tracking-wider text-slate-500">
                    {k.replace(/_/g, ' ')}
                  </span>
                  <span className="font-serif text-sm text-brass">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-item answers */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => {
                const answer = response.responses[item.id];
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 border-b border-ink-line pb-2 last:border-0"
                  >
                    <div className="flex-1 text-xs text-slate-300">
                      {item.text}
                      {item.reversed && (
                        <span className="ml-1 text-slate-600">(reverse-scored)</span>
                      )}
                      {item.subscale && (
                        <span className="ml-1 text-slate-600">· {item.subscale}</span>
                      )}
                    </div>
                    <div className="font-serif text-sm text-brass">
                      {answer !== undefined ? String(answer) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionPanel({
  status,
  chosenCohort,
  onCohortChange,
  cohorts,
  acting,
  onInvite,
  onMarkHeld,
  onDecide,
  onBack,
}: {
  status: ApplicationStatus;
  chosenCohort: string;
  onCohortChange: (v: string) => void;
  cohorts: CohortOption[];
  acting: boolean;
  onInvite: () => void;
  onMarkHeld: () => void;
  onDecide: (d: 'approved_confirmed' | 'approved_waitlisted' | 'declined' | 'on_hold') => void;
  onBack: () => void;
}) {
  if (status === 'assessments_done' || status === 'prospect' || status === 'pdp_purchased') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Assessments are complete. Review the results above, then invite the candidate to an
          interview.
        </p>
        <button className="btn-primary text-sm" onClick={onInvite} disabled={acting}>
          {acting ? 'Inviting…' : 'Invite to Interview'}
        </button>
      </div>
    );
  }

  if (status === 'interview_invited' || status === 'interview_scheduled') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Waiting on the interview. After the call, mark it held to unlock the decision.
        </p>
        <button className="btn text-sm" onClick={onMarkHeld} disabled={acting}>
          Mark Interview Held
        </button>
      </div>
    );
  }

  if (status === 'interview_held') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Make a decision:</p>
        <div className="flex flex-wrap gap-2">
          <select
            className="input max-w-[220px] text-sm"
            value={chosenCohort}
            onChange={(e) => onCohortChange(e.target.value)}
          >
            <option value="">— Cohort (required to confirm) —</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="btn-primary text-sm"
            onClick={() => onDecide('approved_confirmed')}
            disabled={acting || !chosenCohort}
          >
            Approve → Cohort
          </button>
          <button
            className="btn text-sm"
            onClick={() => onDecide('approved_waitlisted')}
            disabled={acting}
          >
            Approve → Waitlist
          </button>
          <button className="btn text-sm" onClick={() => onDecide('on_hold')} disabled={acting}>
            Hold
          </button>
          <button
            className="btn text-sm text-red-400"
            onClick={() => {
              if (confirm('Decline this application? This sends a decline SMS.')) onDecide('declined');
            }}
            disabled={acting}
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Decision recorded. Status: <strong className="text-slate-100">{status}</strong>
      </p>
      <button className="btn text-xs" onClick={onBack}>
        Back to queue
      </button>
    </div>
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

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-line py-2 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-line py-2 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs ${at ? 'text-slate-200' : 'text-slate-600'}`}>
        {at ? new Date(at).toLocaleString() : '—'}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const color =
    status === 'approved_confirmed' || status === 'approved_waitlisted'
      ? 'bg-emerald-500/10 text-emerald-400'
      : status === 'declined'
      ? 'bg-red-500/10 text-red-400'
      : status === 'on_hold'
      ? 'bg-slate-500/10 text-slate-400'
      : 'bg-brass/10 text-brass';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
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

function fmtType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
