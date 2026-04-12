// ============================================================
// Application data loader
// Fetches the candidate's application row + derived booleans
// needed by the pipeline state machine.
// ============================================================

import { supabase } from '@/lib/supabase';
import type { ApplicationState, ApplicationStatus } from './pipeline';

export interface ApplicationRow {
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
  decision_email_sent_at: string | null;
  decision_sms_sent_at: string | null;
  target_cohort_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Load the current user's application + derive onboarding completion flags.
 * Returns null if no application row exists (shouldn't happen post-trigger).
 */
export async function loadApplicationState(
  userId: string,
): Promise<(ApplicationState & { application: ApplicationRow }) | null> {
  const { data: app } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!app) return null;

  // Profile completeness: name present is our proxy for "profile_setup done"
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, onboarding_step, onboarding_complete')
    .eq('id', userId)
    .maybeSingle();

  const profileComplete = Boolean(profile?.name);

  // Fee payment: paid deposit OR paid full
  const { data: feePayments } = await supabase
    .from('payments')
    .select('purpose, status')
    .eq('user_id', userId)
    .in('purpose', ['deposit', 'full', 'final']);

  const paidPurposes = new Set(
    (feePayments ?? [])
      .filter((p) => p.status === 'paid')
      .map((p) => p.purpose),
  );
  const feePaid =
    paidPurposes.has('full') ||
    paidPurposes.has('deposit') ||
    paidPurposes.has('final');

  // Intake done: app.assessments_completed_at stamped
  const intakeDone = !!app.assessments_completed_at;

  // Interview booked: has row in interview_bookings
  const { data: booking } = await supabase
    .from('interview_bookings')
    .select('id')
    .eq('user_id', userId)
    .is('cancelled_at', null)
    .limit(1)
    .maybeSingle();

  const interviewBooked = !!booking;

  // Expectations/walkthrough/squad tracked via profiles.onboarding_step for now
  const onboardingStep = profile?.onboarding_step ?? 'account_created';
  const expectationsAck = [
    'expectations_acknowledged',
    'walkthrough_complete',
    'squad_assigned',
    'complete',
  ].includes(onboardingStep);
  const walkthroughDone = [
    'walkthrough_complete',
    'squad_assigned',
    'complete',
  ].includes(onboardingStep);

  // Squad assigned: has row in squad_members for a non-intake-pool cohort
  const { data: squadRows } = await supabase
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', userId)
    .is('removed_at', null)
    .limit(1);

  const squadAssigned = (squadRows?.length ?? 0) > 0;

  return {
    application: app,
    status: app.status as ApplicationStatus,
    profileComplete,
    intakeDone,
    interviewBooked,
    feePaid,
    expectationsAck,
    walkthroughDone,
    squadAssigned,
    targetCohortId: app.target_cohort_id,
  };
}

/**
 * Update the application status. Used by various onboarding steps when
 * they finish their work.
 */
export async function setApplicationStatus(
  userId: string,
  status: ApplicationStatus,
  extras?: Partial<Omit<ApplicationRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
) {
  return supabase
    .from('applications')
    .update({ status, ...extras })
    .eq('user_id', userId);
}
