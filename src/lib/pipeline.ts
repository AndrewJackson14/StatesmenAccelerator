// ============================================================
// Pipeline state machine helper
// Single source of truth for which onboarding step a user sees
// based on their applications.status.
//
// The PDP ($49 book + pre-assessments) is a separate product
// tracked in a different system. This flow picks up AFTER a
// candidate has completed the PDP and been invited to apply
// for the Accelerator.
// ============================================================

export type ApplicationStatus =
  | 'prospect'
  | 'pdp_purchased' // legacy, unused in current flow
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

  if (state.status === 'prospect' || state.status === 'pdp_purchased') {
    if (!state.profileComplete) return 'profile_setup';
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

export function isFullyActive(state: ApplicationState): boolean {
  return currentStep(state) === 'active';
}

/**
 * Pricing — kept in one place so the Stripe edge function and the UI agree.
 * PDP is not here; it lives in the separate PDP product/system.
 */
export const PRICING = {
  deposit_cents: 22500,
  final_cents: 22500,
  full_cents: 45000,
} as const;

export const PRICE_LABEL = {
  deposit: '$225',
  final: '$225',
  full: '$450',
} as const;
