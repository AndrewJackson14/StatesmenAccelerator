// ============================================================
// Accelerator Academy — Database Types
// Auto-generated from Supabase schema (migration 004)
// ============================================================

// ── ENUMS ──

export type Role = 'gentleman' | 'captain' | 'headmaster' | 'officer' | 'alumni';
export type CohortStatus = 'upcoming' | 'active' | 'completed' | 'archived';
export type CohortPhase = 'phase1' | 'phase2a' | 'phase2b' | 'phase3';
export type SquadMemberRole = 'leader' | 'deputy' | 'member';
export type SessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type ActivityType =
  | 'peer_rating' | 'challenge_log' | 'commitment_entry'
  | 'hot_seat' | 'squad_vote' | 'observation'
  | 'flag_submission' | 'attendance';
export type AssessmentType =
  | 'resolve_scale' | 'efficacy_index' | 'mental_health_screen'
  | 'weekly_pulse' | 'character_profile' | 'self_assessment'
  | 'peer_360' | 'coach_observation';
export type AssessmentInstanceStatus = 'draft' | 'scheduled' | 'open' | 'closed';
export type FlagType =
  | 'attendance_drop' | 'attendance_critical'
  | 'pulse_decline' | 'pulse_critical'
  | 'challenge_dropout' | 'peer_concern' | 'peer_critical'
  | 'engagement_gap' | 'zero_recognition' | 'project_stall'
  | 'breakthrough' | 'concern_engagement' | 'concern_behavior'
  | 'concern_wellbeing' | 'escalation_required';
export type FlagSeverity = 'yellow' | 'red' | 'positive';
export type FlagStatus = 'open' | 'acknowledged' | 'resolved';
export type ConfirmationStanding =
  | 'confirmed_distinction' | 'confirmed' | 'confirmed_conditions'
  | 'provisional' | 'non_confirmed' | 'pending';
export type ConversationType = 'dm' | 'squad' | 'cohort' | 'announcement';
export type NotificationChannel = 'in_app' | 'push' | 'email';
export type DigestPreference = 'immediate' | 'daily' | 'weekly';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'left_early';
export type EngagementLevel = 'high' | 'moderate' | 'low' | 'disengaged';
export type ParticipationQuality = 'leading' | 'contributing' | 'present' | 'passive';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'waived';
export type OnboardingStep =
  | 'account_created' | 'profile_setup' | 'intake_assessments'
  | 'expectations_acknowledged' | 'walkthrough_complete'
  | 'squad_assigned' | 'complete';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── TABLE ROWS ──

export interface ProfileRow {
  id: string;
  role: Role;
  name: string | null;
  photo_url: string | null;
  location: string | null;
  age: number | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  purpose_statement: string | null;
  confirmation_standing: string | null;
  onboarding_step: OnboardingStep;
  onboarding_complete: boolean;
  two_fa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  role?: Role;
  name?: string | null;
  photo_url?: string | null;
  location?: string | null;
  age?: number | null;
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  purpose_statement?: string | null;
  confirmation_standing?: string | null;
  onboarding_step?: OnboardingStep;
  onboarding_complete?: boolean;
  two_fa_enabled?: boolean;
}

export type ProfileUpdate = Partial<ProfileInsert>;

export interface CohortRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: CohortStatus;
  current_phase: CohortPhase | null;
  max_capacity: number | null;
  created_at: string;
  updated_at: string;
}

export interface CohortInsert {
  id?: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: CohortStatus;
  current_phase?: CohortPhase | null;
  max_capacity?: number | null;
}

export type CohortUpdate = Partial<CohortInsert>;

export interface CohortMemberRow {
  cohort_id: string;
  user_id: string;
  role: Role;
  enrolled_at: string;
  dropped_at: string | null;
}

export interface CohortMemberInsert {
  cohort_id: string;
  user_id: string;
  role: Role;
  enrolled_at?: string;
  dropped_at?: string | null;
}

export type CohortMemberUpdate = Partial<CohortMemberInsert>;

export interface SquadRow {
  id: string;
  cohort_id: string;
  name: string;
  phase: CohortPhase | null;
  archived_at: string | null;
  created_at: string;
}

export interface SquadInsert {
  id?: string;
  cohort_id: string;
  name: string;
  phase?: CohortPhase | null;
  archived_at?: string | null;
}

export type SquadUpdate = Partial<SquadInsert>;

export interface SquadMemberRow {
  squad_id: string;
  user_id: string;
  role: SquadMemberRole;
  assigned_at: string;
  removed_at: string | null;
}

export interface SquadMemberInsert {
  squad_id: string;
  user_id: string;
  role?: SquadMemberRole;
  assigned_at?: string;
  removed_at?: string | null;
}

export type SquadMemberUpdate = Partial<SquadMemberInsert>;

export interface SessionRow {
  id: string;
  cohort_id: string;
  session_number: number;
  phase: CohortPhase;
  title: string | null;
  description: string | null;
  exercise_id: string | null;
  scheduled_at: string;
  duration_min: number | null;
  webex_link: string | null;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface SessionInsert {
  id?: string;
  cohort_id: string;
  session_number: number;
  phase: CohortPhase;
  title?: string | null;
  description?: string | null;
  exercise_id?: string | null;
  scheduled_at: string;
  duration_min?: number | null;
  webex_link?: string | null;
  status?: SessionStatus;
}

export type SessionUpdate = Partial<SessionInsert>;

export interface SessionActivityRow {
  id: string;
  session_id: string;
  type: ActivityType;
  title: string;
  content: Json;
  sort_order: number;
  unlocked_at: string | null;
  created_at: string;
}

export interface SessionActivityInsert {
  id?: string;
  session_id: string;
  type: ActivityType;
  title: string;
  content?: Json;
  sort_order?: number;
  unlocked_at?: string | null;
}

export type SessionActivityUpdate = Partial<SessionActivityInsert>;

export interface SessionAttendanceRow {
  session_id: string;
  user_id: string;
  status: AttendanceStatus;
  joined_at: string | null;
  left_at: string | null;
  duration_min: number | null;
  camera_on_pct: number | null;
  speaking_time_sec: number | null;
  engagement: EngagementLevel | null;
  participation: ParticipationQuality | null;
  override_by: string | null;
  override_reason: string | null;
}

export interface SessionAttendanceInsert {
  session_id: string;
  user_id: string;
  status?: AttendanceStatus;
  joined_at?: string | null;
  left_at?: string | null;
  duration_min?: number | null;
  camera_on_pct?: number | null;
  speaking_time_sec?: number | null;
  engagement?: EngagementLevel | null;
  participation?: ParticipationQuality | null;
  override_by?: string | null;
  override_reason?: string | null;
}

export type SessionAttendanceUpdate = Partial<SessionAttendanceInsert>;

export interface AssessmentTemplateRow {
  id: string;
  name: string;
  type: AssessmentType;
  version: number;
  items: Json;
  scoring: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssessmentTemplateInsert {
  id?: string;
  name: string;
  type: AssessmentType;
  version?: number;
  items?: Json;
  scoring?: Json;
  created_by?: string | null;
}

export type AssessmentTemplateUpdate = Partial<AssessmentTemplateInsert>;

export interface AssessmentInstanceRow {
  id: string;
  template_id: string;
  cohort_id: string;
  release_date: string | null;
  deadline: string | null;
  status: AssessmentInstanceStatus;
  created_at: string;
}

export interface AssessmentInstanceInsert {
  id?: string;
  template_id: string;
  cohort_id: string;
  release_date?: string | null;
  deadline?: string | null;
  status?: AssessmentInstanceStatus;
}

export type AssessmentInstanceUpdate = Partial<AssessmentInstanceInsert>;

export interface AssessmentResponseRow {
  id: string;
  instance_id: string;
  user_id: string;
  responses: Json;
  score: number | null;
  subscores: Json;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface AssessmentResponseInsert {
  id?: string;
  instance_id: string;
  user_id: string;
  responses?: Json;
  score?: number | null;
  subscores?: Json;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export type AssessmentResponseUpdate = Partial<AssessmentResponseInsert>;

export interface PeerRatingRow {
  id: string;
  session_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number;
  note: string | null;
  created_at: string;
}

export interface PeerRatingInsert {
  id?: string;
  session_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number;
  note?: string | null;
}

export type PeerRatingUpdate = Partial<PeerRatingInsert>;

export interface Peer360RatingRow {
  id: string;
  instance_id: string;
  rater_id: string;
  ratee_id: string;
  initiative: number | null;
  influence: number | null;
  accountability: number | null;
  composure: number | null;
  trustworthiness: number | null;
  contribution: number | null;
  vulnerability: number | null;
  growth_observed: number | null;
  open_feedback: string | null;
  submitted_at: string;
}

export interface Peer360RatingInsert {
  id?: string;
  instance_id: string;
  rater_id: string;
  ratee_id: string;
  initiative?: number | null;
  influence?: number | null;
  accountability?: number | null;
  composure?: number | null;
  trustworthiness?: number | null;
  contribution?: number | null;
  vulnerability?: number | null;
  growth_observed?: number | null;
  open_feedback?: string | null;
}

export type Peer360RatingUpdate = Partial<Peer360RatingInsert>;

export interface CoachObservationRow {
  id: string;
  session_id: string;
  captain_id: string;
  gentleman_id: string;
  engagement: EngagementLevel | null;
  participation: ParticipationQuality | null;
  behaviors: Json;
  flags: Json;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface CoachObservationInsert {
  id?: string;
  session_id: string;
  captain_id: string;
  gentleman_id: string;
  engagement?: EngagementLevel | null;
  participation?: ParticipationQuality | null;
  behaviors?: Json;
  flags?: Json;
  notes?: string | null;
}

export type CoachObservationUpdate = Partial<CoachObservationInsert>;

export interface FlagRow {
  id: string;
  user_id: string;
  cohort_id: string | null;
  flag_type: FlagType;
  severity: FlagSeverity;
  status: FlagStatus;
  trigger_data: Json;
  triggered_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
}

export interface FlagInsert {
  id?: string;
  user_id: string;
  cohort_id?: string | null;
  flag_type: FlagType;
  severity: FlagSeverity;
  status?: FlagStatus;
  trigger_data?: Json;
  acknowledged_by?: string | null;
  resolution_notes?: string | null;
  escalated_to?: string | null;
}

export type FlagUpdate = Partial<FlagInsert>;

export interface LeadershipScoreRow {
  id: string;
  user_id: string;
  cohort_id: string;
  week: number;
  score: number;
  rank: number | null;
  components: Json;
  calculated_at: string;
}

export interface LeadershipScoreInsert {
  id?: string;
  user_id: string;
  cohort_id: string;
  week: number;
  score: number;
  rank?: number | null;
  components?: Json;
}

export type LeadershipScoreUpdate = Partial<LeadershipScoreInsert>;

export interface SquadPointsRow {
  id: string;
  squad_id: string;
  session_id: string | null;
  points: number;
  reason: string | null;
  awarded_by: string | null;
  created_at: string;
}

export interface SquadPointsInsert {
  id?: string;
  squad_id: string;
  session_id?: string | null;
  points?: number;
  reason?: string | null;
  awarded_by?: string | null;
}

export type SquadPointsUpdate = Partial<SquadPointsInsert>;

export interface ChallengeRow {
  id: string;
  cohort_id: string;
  session_id: string | null;
  week: number;
  title: string;
  description: string | null;
  difficulty: number | null;
  due_date: string | null;
  created_at: string;
}

export interface ChallengeInsert {
  id?: string;
  cohort_id: string;
  session_id?: string | null;
  week: number;
  title: string;
  description?: string | null;
  difficulty?: number | null;
  due_date?: string | null;
}

export type ChallengeUpdate = Partial<ChallengeInsert>;

export interface ChallengeCompletionRow {
  challenge_id: string;
  user_id: string;
  result: string | null;
  completed_at: string;
}

export interface ChallengeCompletionInsert {
  challenge_id: string;
  user_id: string;
  result?: string | null;
}

export type ChallengeCompletionUpdate = Partial<ChallengeCompletionInsert>;

export interface PersonalProjectRow {
  id: string;
  user_id: string;
  cohort_id: string;
  title: string;
  description: string | null;
  status: string | null;
  milestones: Json;
  eval_completion: number | null;
  eval_ambition: number | null;
  eval_growth: number | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalProjectInsert {
  id?: string;
  user_id: string;
  cohort_id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  milestones?: Json;
}

export type PersonalProjectUpdate = Partial<PersonalProjectInsert>;

export interface ConfirmationStandingRow {
  id: string;
  user_id: string;
  cohort_id: string;
  gates: Json;
  gates_passed: boolean;
  challenge_completion: number | null;
  self_assessment_trajectory: number | null;
  peer_360_average: number | null;
  leadership_performance: number | null;
  resolve_efficacy_growth: number | null;
  capstone_quality: number | null;
  coach_evaluation: number | null;
  total_score: number | null;
  standing: ConfirmationStanding;
  override_by: string | null;
  override_reason: string | null;
  calculated_at: string;
}

export interface ConfirmationStandingInsert {
  id?: string;
  user_id: string;
  cohort_id: string;
  gates?: Json;
  gates_passed?: boolean;
  standing?: ConfirmationStanding;
}

export type ConfirmationStandingUpdate = Partial<ConfirmationStandingInsert>;

export interface ConversationRow {
  id: string;
  type: ConversationType;
  squad_id: string | null;
  cohort_id: string | null;
  created_at: string;
}

export interface ConversationInsert {
  id?: string;
  type: ConversationType;
  squad_id?: string | null;
  cohort_id?: string | null;
}

export type ConversationUpdate = Partial<ConversationInsert>;

export interface ConversationParticipantRow {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  muted: boolean;
}

export interface ConversationParticipantInsert {
  conversation_id: string;
  user_id: string;
  joined_at?: string;
  last_read_at?: string | null;
  muted?: boolean;
}

export type ConversationParticipantUpdate = Partial<ConversationParticipantInsert>;

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  pinned: boolean;
  reported: boolean;
  reported_by: string | null;
  starred: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface MessageInsert {
  id?: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  pinned?: boolean;
  reported?: boolean;
  starred?: boolean;
}

export type MessageUpdate = Partial<MessageInsert>;

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  channels: NotificationChannel[];
  data: Json;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInsert {
  id?: string;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  channels?: NotificationChannel[];
  data?: Json;
}

export type NotificationUpdate = Partial<NotificationInsert>;

export interface NotificationPreferenceRow {
  user_id: string;
  category: string;
  push_enabled: boolean;
  email_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  digest: DigestPreference;
}

export interface NotificationPreferenceInsert {
  user_id: string;
  category: string;
  push_enabled?: boolean;
  email_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  digest?: DigestPreference;
}

export type NotificationPreferenceUpdate = Partial<NotificationPreferenceInsert>;

export interface PaymentRow {
  id: string;
  user_id: string;
  cohort_id: string | null;
  stripe_payment_id: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  discount_code: string | null;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export interface PaymentInsert {
  id?: string;
  user_id: string;
  cohort_id?: string | null;
  stripe_payment_id?: string | null;
  amount_cents: number;
  currency?: string;
  status?: PaymentStatus;
  discount_code?: string | null;
}

export type PaymentUpdate = Partial<PaymentInsert>;

export interface DiscountCodeRow {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface DiscountCodeInsert {
  id?: string;
  code: string;
  description?: string | null;
  type?: string;
  value: number;
  max_uses?: number | null;
  active?: boolean;
  expires_at?: string | null;
}

export type DiscountCodeUpdate = Partial<DiscountCodeInsert>;

export interface ExerciseRow {
  id: string;
  title: string;
  description: string | null;
  phase: CohortPhase;
  duration_min: number | null;
  materials: Json;
  template: Json;
  created_by: string | null;
  created_at: string;
}

export interface ExerciseInsert {
  id?: string;
  title: string;
  description?: string | null;
  phase?: CohortPhase;
  duration_min?: number | null;
  materials?: Json;
  template?: Json;
  created_by?: string | null;
}

export type ExerciseUpdate = Partial<ExerciseInsert>;

export interface DoseMetricsRow {
  id: string;
  user_id: string;
  cohort_id: string;
  week: number;
  dopamine: number | null;
  oxytocin: number | null;
  serotonin: number | null;
  endorphins: number | null;
  recommendations: Json;
  calculated_at: string;
}

export interface DoseMetricsInsert {
  id?: string;
  user_id: string;
  cohort_id: string;
  week: number;
  dopamine?: number | null;
  oxytocin?: number | null;
  serotonin?: number | null;
  endorphins?: number | null;
  recommendations?: Json;
}

export type DoseMetricsUpdate = Partial<DoseMetricsInsert>;

export interface DoseWeightsRow {
  id: string;
  label: string;
  dopamine_w: number;
  oxytocin_w: number;
  serotonin_w: number;
  endorphins_w: number;
  active: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface DoseWeightsInsert {
  id?: string;
  label: string;
  dopamine_w?: number;
  oxytocin_w?: number;
  serotonin_w?: number;
  endorphins_w?: number;
  active?: boolean;
  updated_by?: string | null;
}

export type DoseWeightsUpdate = Partial<DoseWeightsInsert>;

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Json;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogInsert {
  id?: string;
  user_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: Json;
  ip_address?: string | null;
}

export type AuditLogUpdate = Partial<AuditLogInsert>;

export interface SystemConfigRow {
  key: string;
  value: Json;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface SystemConfigInsert {
  key: string;
  value: Json;
  description?: string | null;
  updated_by?: string | null;
}

export type SystemConfigUpdate = Partial<SystemConfigInsert>;

export interface AlumniAccomplishmentRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  url: string | null;
  created_at: string;
}

export interface AlumniAccomplishmentInsert {
  id?: string;
  user_id: string;
  title: string;
  description?: string | null;
  url?: string | null;
}

export type AlumniAccomplishmentUpdate = Partial<AlumniAccomplishmentInsert>;

export interface CheckinLogRow {
  id: string;
  captain_id: string;
  gentleman_id: string;
  cohort_id: string | null;
  notes: string | null;
  flag_id: string | null;
  checked_in_at: string;
}

export interface CheckinLogInsert {
  id?: string;
  captain_id: string;
  gentleman_id: string;
  cohort_id?: string | null;
  notes?: string | null;
  flag_id?: string | null;
}

export type CheckinLogUpdate = Partial<CheckinLogInsert>;

// ── FULL DATABASE TYPE ──

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      cohorts: {
        Row: CohortRow;
        Insert: CohortInsert;
        Update: CohortUpdate;
      };
      cohort_members: {
        Row: CohortMemberRow;
        Insert: CohortMemberInsert;
        Update: CohortMemberUpdate;
      };
      squads: {
        Row: SquadRow;
        Insert: SquadInsert;
        Update: SquadUpdate;
      };
      squad_members: {
        Row: SquadMemberRow;
        Insert: SquadMemberInsert;
        Update: SquadMemberUpdate;
      };
      sessions: {
        Row: SessionRow;
        Insert: SessionInsert;
        Update: SessionUpdate;
      };
      session_activities: {
        Row: SessionActivityRow;
        Insert: SessionActivityInsert;
        Update: SessionActivityUpdate;
      };
      session_attendance: {
        Row: SessionAttendanceRow;
        Insert: SessionAttendanceInsert;
        Update: SessionAttendanceUpdate;
      };
      assessment_templates: {
        Row: AssessmentTemplateRow;
        Insert: AssessmentTemplateInsert;
        Update: AssessmentTemplateUpdate;
      };
      assessment_instances: {
        Row: AssessmentInstanceRow;
        Insert: AssessmentInstanceInsert;
        Update: AssessmentInstanceUpdate;
      };
      assessment_responses: {
        Row: AssessmentResponseRow;
        Insert: AssessmentResponseInsert;
        Update: AssessmentResponseUpdate;
      };
      peer_ratings: {
        Row: PeerRatingRow;
        Insert: PeerRatingInsert;
        Update: PeerRatingUpdate;
      };
      peer_360_ratings: {
        Row: Peer360RatingRow;
        Insert: Peer360RatingInsert;
        Update: Peer360RatingUpdate;
      };
      coach_observations: {
        Row: CoachObservationRow;
        Insert: CoachObservationInsert;
        Update: CoachObservationUpdate;
      };
      flags: {
        Row: FlagRow;
        Insert: FlagInsert;
        Update: FlagUpdate;
      };
      leadership_scores: {
        Row: LeadershipScoreRow;
        Insert: LeadershipScoreInsert;
        Update: LeadershipScoreUpdate;
      };
      squad_points: {
        Row: SquadPointsRow;
        Insert: SquadPointsInsert;
        Update: SquadPointsUpdate;
      };
      challenges: {
        Row: ChallengeRow;
        Insert: ChallengeInsert;
        Update: ChallengeUpdate;
      };
      challenge_completions: {
        Row: ChallengeCompletionRow;
        Insert: ChallengeCompletionInsert;
        Update: ChallengeCompletionUpdate;
      };
      personal_projects: {
        Row: PersonalProjectRow;
        Insert: PersonalProjectInsert;
        Update: PersonalProjectUpdate;
      };
      confirmation_standings: {
        Row: ConfirmationStandingRow;
        Insert: ConfirmationStandingInsert;
        Update: ConfirmationStandingUpdate;
      };
      conversations: {
        Row: ConversationRow;
        Insert: ConversationInsert;
        Update: ConversationUpdate;
      };
      conversation_participants: {
        Row: ConversationParticipantRow;
        Insert: ConversationParticipantInsert;
        Update: ConversationParticipantUpdate;
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: MessageUpdate;
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
      notification_preferences: {
        Row: NotificationPreferenceRow;
        Insert: NotificationPreferenceInsert;
        Update: NotificationPreferenceUpdate;
      };
      payments: {
        Row: PaymentRow;
        Insert: PaymentInsert;
        Update: PaymentUpdate;
      };
      discount_codes: {
        Row: DiscountCodeRow;
        Insert: DiscountCodeInsert;
        Update: DiscountCodeUpdate;
      };
      exercises: {
        Row: ExerciseRow;
        Insert: ExerciseInsert;
        Update: ExerciseUpdate;
      };
      dose_metrics: {
        Row: DoseMetricsRow;
        Insert: DoseMetricsInsert;
        Update: DoseMetricsUpdate;
      };
      dose_weights: {
        Row: DoseWeightsRow;
        Insert: DoseWeightsInsert;
        Update: DoseWeightsUpdate;
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        Update: AuditLogUpdate;
      };
      system_config: {
        Row: SystemConfigRow;
        Insert: SystemConfigInsert;
        Update: SystemConfigUpdate;
      };
      alumni_accomplishments: {
        Row: AlumniAccomplishmentRow;
        Insert: AlumniAccomplishmentInsert;
        Update: AlumniAccomplishmentUpdate;
      };
      checkin_log: {
        Row: CheckinLogRow;
        Insert: CheckinLogInsert;
        Update: CheckinLogUpdate;
      };
    };
    Views: { [key: string]: never };
    Functions: {
      current_user_role: {
        Args: Record<string, never>;
        Returns: Role;
      };
      is_leadership: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_headmaster: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: Role;
      cohort_status: CohortStatus;
      cohort_phase: CohortPhase;
      squad_member_role: SquadMemberRole;
      session_status: SessionStatus;
      activity_type: ActivityType;
      assessment_type: AssessmentType;
      assessment_instance_status: AssessmentInstanceStatus;
      flag_type: FlagType;
      flag_severity: FlagSeverity;
      flag_status: FlagStatus;
      confirmation_standing_enum: ConfirmationStanding;
      conversation_type: ConversationType;
      notification_channel: NotificationChannel;
      digest_preference: DigestPreference;
      attendance_status: AttendanceStatus;
      engagement_level: EngagementLevel;
      participation_quality: ParticipationQuality;
      payment_status: PaymentStatus;
      onboarding_step: OnboardingStep;
    };
  };
}
