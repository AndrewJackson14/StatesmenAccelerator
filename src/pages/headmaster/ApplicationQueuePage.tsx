import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { sendSmsToUser, SMS } from '@/lib/sms';
import type { ApplicationStatus } from '@/lib/pipeline';
import { STEP_LABEL, currentStep } from '@/lib/pipeline';

interface ApplicationWithProfile {
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
  decided_at: string | null;
  target_cohort_id: string | null;
  profiles: {
    name: string | null;
    email: string | null;
    photo_url: string | null;
    phone: string | null;
  } | null;
}

interface CohortOption {
  id: string;
  name: string;
  status: string;
}

type TabKey = 'review' | 'scheduled' | 'held' | 'all';

const TAB_FILTERS: Record<TabKey, ApplicationStatus[]> = {
  review: ['assessments_done', 'pdp_purchased'],
  scheduled: ['interview_invited', 'interview_scheduled'],
  held: ['interview_held'],
  all: [],
};

export default function ApplicationQueuePage() {
  const { user } = useAuth();
  const [apps, setApps] = useState<ApplicationWithProfile[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('review');
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: appData }, { data: cohortData }] = await Promise.all([
      supabase
        .from('applications')
        .select('*, profiles!applications_user_id_fkey(name, email, photo_url, phone)')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('cohorts')
        .select('id, name, status')
        .neq('name', 'Intake Pool')
        .in('status', ['upcoming', 'active'])
        .order('name'),
    ]);
    setApps((appData as ApplicationWithProfile[]) ?? []);
    setCohorts(cohortData ?? []);
    setLoading(false);
  }

  async function inviteToInterview(app: ApplicationWithProfile) {
    setActing(app.id);
    await supabase
      .from('applications')
      .update({
        status: 'interview_invited',
        interview_invited_at: new Date().toISOString(),
      })
      .eq('id', app.id);
    await sendSmsToUser(app.user_id, SMS.interviewInvite());
    setActing(null);
    loadAll();
  }

  async function markInterviewHeld(app: ApplicationWithProfile) {
    setActing(app.id);
    await supabase
      .from('applications')
      .update({
        status: 'interview_held',
        interview_held_at: new Date().toISOString(),
      })
      .eq('id', app.id);
    setActing(null);
    loadAll();
  }

  async function decide(
    app: ApplicationWithProfile,
    decision: 'approved_waitlisted' | 'approved_confirmed' | 'declined' | 'on_hold',
    targetCohortId?: string,
  ) {
    setActing(app.id);

    const updates: Record<string, unknown> = {
      status: decision,
      decided_by: user?.id,
      decided_at: new Date().toISOString(),
    };
    if (targetCohortId) updates.target_cohort_id = targetCohortId;
    await supabase.from('applications').update(updates).eq('id', app.id);

    // If approved to a cohort, also enroll in cohort_members
    if (decision === 'approved_confirmed' && targetCohortId) {
      await supabase.from('cohort_members').upsert(
        { cohort_id: targetCohortId, user_id: app.user_id, role: 'gentleman' },
        { onConflict: 'cohort_id,user_id' },
      );
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: `application_${decision}`,
      entity_type: 'application',
      entity_id: app.id,
      details: { target_cohort_id: targetCohortId ?? null, applicant: app.profiles?.name },
    });

    // Decision SMS
    const smsBody =
      decision === 'approved_confirmed'
        ? SMS.approvedConfirmed()
        : decision === 'approved_waitlisted'
        ? SMS.approvedWaitlisted()
        : decision === 'declined'
        ? SMS.declined()
        : SMS.onHold();
    await sendSmsToUser(app.user_id, smsBody);
    await supabase
      .from('applications')
      .update({ decision_sms_sent_at: new Date().toISOString() })
      .eq('id', app.id);

    setActing(null);
    loadAll();
  }

  const filtered = apps.filter(
    (a) => TAB_FILTERS[tab].length === 0 || TAB_FILTERS[tab].includes(a.status),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Loading applications…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Application Queue</h1>
        <p className="mt-1 text-sm text-slate-400">
          Review candidates, invite to interviews, and make decisions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-ink-line">
        {(['review', 'scheduled', 'held', 'all'] as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm transition ${
              tab === k
                ? 'border-b-2 border-brass text-brass'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {TAB_LABELS[k]} ({apps.filter((a) => TAB_FILTERS[k].length === 0 || TAB_FILTERS[k].includes(a.status)).length})
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState message="No applications in this view." />
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              cohorts={cohorts}
              acting={acting === app.id}
              onInvite={() => inviteToInterview(app)}
              onMarkHeld={() => markInterviewHeld(app)}
              onDecide={(decision, cohortId) => decide(app, decision, cohortId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TAB_LABELS: Record<TabKey, string> = {
  review: 'Ready for Review',
  scheduled: 'Interview Scheduled',
  held: 'Awaiting Decision',
  all: 'All',
};

function ApplicationCard({
  app,
  cohorts,
  acting,
  onInvite,
  onMarkHeld,
  onDecide,
}: {
  app: ApplicationWithProfile;
  cohorts: CohortOption[];
  acting: boolean;
  onInvite: () => void;
  onMarkHeld: () => void;
  onDecide: (
    decision: 'approved_waitlisted' | 'approved_confirmed' | 'declined' | 'on_hold',
    cohortId?: string,
  ) => void;
}) {
  const [chosenCohort, setChosenCohort] = useState<string>('');

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
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-medium text-slate-100">
            {app.profiles?.name ?? 'Unnamed'}
          </div>
          <div className="text-xs text-slate-500">
            {app.profiles?.email} {app.profiles?.phone && `· ${app.profiles.phone}`}
          </div>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="flex gap-4 text-xs text-slate-500">
        <span>Applied {timeAgo(app.submitted_at)}</span>
        {app.pdp_purchased_at && <span>· PDP paid</span>}
        {app.assessments_completed_at && <span>· Intake done</span>}
        {app.interview_scheduled_at && <span>· Interview set</span>}
      </div>

      <div className="text-xs text-brass">Current step: {STEP_LABEL[step]}</div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-ink-line pt-3">
        {app.status === 'assessments_done' && (
          <button className="btn-primary text-xs" onClick={onInvite} disabled={acting}>
            Invite to Interview
          </button>
        )}
        {app.status === 'interview_scheduled' && (
          <button className="btn text-xs" onClick={onMarkHeld} disabled={acting}>
            Mark Interview Held
          </button>
        )}
        {app.status === 'interview_held' && (
          <>
            <select
              className="input max-w-[200px] text-xs"
              value={chosenCohort}
              onChange={(e) => setChosenCohort(e.target.value)}
            >
              <option value="">— Cohort (for confirmed) —</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="btn-primary text-xs"
              onClick={() => onDecide('approved_confirmed', chosenCohort)}
              disabled={acting || !chosenCohort}
            >
              Approve → Cohort
            </button>
            <button
              className="btn text-xs"
              onClick={() => onDecide('approved_waitlisted')}
              disabled={acting}
            >
              Approve → Waitlist
            </button>
            <button
              className="btn text-xs"
              onClick={() => onDecide('on_hold')}
              disabled={acting}
            >
              Hold
            </button>
            <button
              className="btn text-xs text-red-400"
              onClick={() => {
                if (confirm('Decline this application?')) onDecide('declined');
              }}
              disabled={acting}
            >
              Decline
            </button>
          </>
        )}
        {app.status === 'on_hold' && (
          <span className="text-xs text-slate-500">On hold — revisit when ready.</span>
        )}
      </div>
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
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-line py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function timeAgo(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
