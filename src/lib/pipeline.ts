// ============================================================
// Pipeline state machine helper
// Single source of truth for which onboarding step a user sees
// based on their applications.status.
// ============================================================

export type ApplicationStatus =
  | 'prospect'
  | 'pdp_purchased'
  | 'assessments_done'
  | 'interview_invited'
  | 'interview_scheduled'
  | 'interview_held'
  | 'approved_waitlisted'
  | 'approved_confirmed'
  | 'declined'
  | 'on_hold';

export type PipelineStep =
  | 'profile_setup'
  | 'pdp_payment'
  | 'intake_assessments'
  | 'awaiting_review'
  | 'schedule_interview'
  | 'interview_confirmed'
  | 'awaiting_decision'
  | 'pay_deposit'
  | 'pay_full_fee'
  | 'expectations'
  | 'walkthrough'
  | 'squad_pending'
  | 'active'
  | 'on_hold'
  | 'declined';

export interface ApplicationState {
  status: ApplicationStatus;
  profileComplete: boolean;
  pdpPaid: boolean;
  intakeDone: boolean;
  interviewBooked: boolean;
  feePaid: boolean;
  expectationsAck: boolean;
  walkthroughDone: boolean;
  squadAssigned: boolean;
  targetCohortId: string | null;
}

/**
 * Map the candidate's overall state to the single step they should see next.
 * Status is the primary driver; boolean flags handle sub-steps within a status.
 */
export function currentStep(state: ApplicationState): PipelineStep {
  if (state.status === 'declined') return 'declined';
  if (state.status === 'on_hold') return 'on_hold';

  if (state.status === 'prospect') {
    if (!state.profileComplete) return 'profile_setup';
    if (!state.pdpPaid) return 'pdp_payment';
    // If profile + PDP done, user should be moving to assessments,
    // which flips status to pdp_purchased on payment confirmation.
    return 'pdp_payment';
  }

  if (state.status === 'pdp_purchased') {
    if (!state.intakeDone) return 'intake_assessments';
    return 'awaiting_review';
  }

  if (state.status === 'assessments_done') {
    return 'awaiting_review';
  }

  if (state.status === 'interview_invited') {
    if (!state.interviewBooked) return 'schedule_interview';
    return 'interview_confirmed';
  }

  if (state.status === 'interview_scheduled') {
    return 'interview_confirmed';
  }

  if (state.status === 'interview_held') {
    return 'awaiting_decision';
  }

  if (state.status === 'approved_waitlisted') {
    if (!state.feePaid) return 'pay_deposit';
    if (!state.expectationsAck) return 'expectations';
    if (!state.walkthroughDone) return 'walkthrough';
    return 'squad_pending';
  }

  if (state.status === 'approved_confirmed') {
    if (!state.feePaid) return 'pay_full_fee';
    if (!state.expectationsAck) return 'expectations';
    if (!state.walkthroughDone) return 'walkthrough';
    if (!state.squadAssigned) return 'squad_pending';
    return 'active';
  }

  return 'profile_setup';
}

/**
 * Human-readable labels for each step, for progress indicators / ui.
 */
export const STEP_LABEL: Record<PipelineStep, string> = {
  profile_setup: 'Profile Setup',
  pdp_payment: 'Personal Development Package',
  intake_assessments: 'Intake Assessments',
  awaiting_review: 'Application Review',
  schedule_interview: 'Schedule Interview',
  interview_confirmed: 'Interview Confirmed',
  awaiting_decision: 'Decision Pending',
  pay_deposit: 'Reserve Your Spot',
  pay_full_fee: 'Confirm Enrollment',
  expectations: 'Program Expectations',
  walkthrough: 'Platform Walkthrough',
  squad_pending: 'Squad Assignment',
  active: 'Active',
  on_hold: 'On Hold',
  declined: 'Application Closed',
};

/**
 * A user is "active" in the program when their application is approved_confirmed,
 * fee is paid, and they've completed all onboarding sub-steps + been squadded.
 */
export function isFullyActive(state: ApplicationState): boolean {
  return currentStep(state) === 'active';
}

/**
 * Pricing — kept in one place so the Stripe edge function and the UI agree.
 */
export const PRICING = {
  pdp_cents: 4900,
  deposit_cents: 22500,
  final_cents: 22500,
  full_cents: 45000,
} as const;

export const PRICE_LABEL = {
  pdp: '$49',
  deposit: '$225',
  final: '$225',
  full: '$450',
} as const;
