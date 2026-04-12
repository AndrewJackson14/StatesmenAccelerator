import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
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

type TabKey = 'review' | 'scheduled' | 'held' | 'all';

const TAB_FILTERS: Record<TabKey, ApplicationStatus[]> = {
  review: ['assessments_done', 'pdp_purchased'],
  scheduled: ['interview_invited', 'interview_scheduled'],
  held: ['interview_held'],
  all: [],
};

export default function ApplicationQueuePage() {
  const [apps, setApps] = useState<ApplicationWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('review');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: appData } = await supabase
      .from('applications')
      .select('*, profiles!applications_user_id_fkey(name, email, photo_url, phone)')
      .order('submitted_at', { ascending: false });
    setApps((appData as ApplicationWithProfile[]) ?? []);
    setLoading(false);
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
            <ApplicationCard key={app.id} app={app} />
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

function ApplicationCard({ app }: { app: ApplicationWithProfile }) {
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
    <Link
      to={`/headmaster/applications/${app.id}`}
      className="card block space-y-3 transition hover:border-brass/50 hover:bg-ink-soft"
    >
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
        {app.assessments_completed_at && <span>· Intake done</span>}
        {app.interview_scheduled_at && <span>· Interview set</span>}
      </div>

      <div className="flex items-center justify-between border-t border-ink-line pt-3">
        <div className="text-xs text-brass">Current step: {STEP_LABEL[step]}</div>
        <div className="text-xs text-slate-500">Review →</div>
      </div>
    </Link>
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
