-- ============================================================
-- ACCELERATOR ACADEMY — Complete Supabase Schema
-- Migration 001: Core tables, enums, RLS, functions
-- Derived from: Platform Spec v1.0, Assessment Package v2.0,
--               Session 1 Program Document v1.1
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

create type user_role as enum (
  'gentleman', 'captain', 'headmaster', 'officer', 'alumni'
);

create type cohort_status as enum (
  'upcoming', 'active', 'completed', 'archived'
);

create type cohort_phase as enum (
  'phase1', 'phase2a', 'phase2b', 'phase3'
);

create type squad_member_role as enum (
  'leader', 'deputy', 'member'
);

create type session_status as enum (
  'scheduled', 'live', 'completed', 'cancelled'
);

create type activity_type as enum (
  'peer_rating', 'challenge_log', 'commitment_entry',
  'hot_seat', 'squad_vote', 'observation', 'flag_submission',
  'attendance'
);

create type assessment_type as enum (
  'resolve_scale', 'efficacy_index', 'mental_health_screen',
  'weekly_pulse', 'character_profile', 'self_assessment',
  'peer_360', 'coach_observation'
);

create type assessment_instance_status as enum (
  'draft', 'scheduled', 'open', 'closed'
);

create type flag_type as enum (
  'attendance_drop', 'attendance_critical',
  'pulse_decline', 'pulse_critical',
  'challenge_dropout', 'peer_concern', 'peer_critical',
  'engagement_gap', 'zero_recognition', 'project_stall',
  'breakthrough', 'concern_engagement', 'concern_behavior',
  'concern_wellbeing', 'escalation_required'
);

create type flag_severity as enum ('yellow', 'red', 'positive');

create type flag_status as enum ('open', 'acknowledged', 'resolved');

create type confirmation_standing as enum (
  'confirmed_distinction', 'confirmed', 'confirmed_conditions',
  'provisional', 'non_confirmed', 'pending'
);

create type conversation_type as enum (
  'dm', 'squad', 'cohort', 'announcement'
);

create type notification_channel as enum (
  'in_app', 'push', 'email'
);

create type digest_preference as enum (
  'immediate', 'daily', 'weekly'
);

create type attendance_status as enum (
  'present', 'absent', 'late', 'left_early'
);

create type engagement_level as enum (
  'high', 'moderate', 'low', 'disengaged'
);

create type participation_quality as enum (
  'leading', 'contributing', 'present', 'passive'
);

create type payment_status as enum (
  'pending', 'paid', 'failed', 'refunded', 'waived'
);

create type onboarding_step as enum (
  'account_created', 'profile_setup', 'intake_assessments',
  'expectations_acknowledged', 'walkthrough_complete',
  'squad_assigned', 'complete'
);

-- ────────────────────────────────────────────────────────────
-- HELPER: updated_at trigger
-- ────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────
-- 1. PROFILES (extends Supabase auth.users)
-- ────────────────────────────────────────────────────────────

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'gentleman',
  name        text,
  photo_url   text,
  location    text,
  age         smallint check (age between 14 and 99),
  email       text,
  phone       text,
  bio         text,
  purpose_statement    text,
  confirmation_standing confirmation_standing default 'pending',
  onboarding_step      onboarding_step default 'account_created',
  onboarding_complete  boolean not null default false,
  two_fa_enabled       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. COHORTS
-- ────────────────────────────────────────────────────────────

create table cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date,
  end_date    date,
  status      cohort_status not null default 'upcoming',
  current_phase cohort_phase,
  max_capacity smallint default 30,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger cohorts_updated_at
  before update on cohorts
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. COHORT MEMBERS (links users to cohorts)
-- ────────────────────────────────────────────────────────────

create table cohort_members (
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        user_role not null, -- gentleman, captain, etc.
  enrolled_at timestamptz not null default now(),
  dropped_at  timestamptz,
  primary key (cohort_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 4. SQUADS
-- ────────────────────────────────────────────────────────────

create table squads (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  name        text not null,
  phase       cohort_phase,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 5. SQUAD MEMBERS
-- ────────────────────────────────────────────────────────────

create table squad_members (
  squad_id    uuid not null references squads(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        squad_member_role not null default 'member',
  assigned_at timestamptz not null default now(),
  removed_at  timestamptz,
  primary key (squad_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 6. SESSIONS
-- ────────────────────────────────────────────────────────────

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  cohort_id       uuid not null references cohorts(id) on delete cascade,
  session_number  smallint not null,
  phase           cohort_phase not null,
  title           text,
  description     text,
  exercise_id     uuid,  -- FK to exercise library (Phase 2 rotation)
  scheduled_at    timestamptz not null,
  duration_min    smallint default 90,
  webex_link      text,
  status          session_status not null default 'scheduled',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger sessions_updated_at
  before update on sessions
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 7. SESSION ACTIVITIES (progressive unlock during live session)
-- ────────────────────────────────────────────────────────────

create table session_activities (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  type        activity_type not null,
  title       text not null,
  content     jsonb default '{}',
  sort_order  smallint not null default 0,
  unlocked_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 8. SESSION ATTENDANCE
-- ────────────────────────────────────────────────────────────

create table session_attendance (
  session_id      uuid not null references sessions(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  status          attendance_status not null default 'present',
  joined_at       timestamptz,
  left_at         timestamptz,
  duration_min    smallint,
  camera_on_pct   smallint check (camera_on_pct between 0 and 100),
  speaking_time_sec int,
  engagement      engagement_level,
  participation   participation_quality,
  override_by     uuid references profiles(id),
  override_reason text,
  primary key (session_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 9. ASSESSMENT TEMPLATES
-- ────────────────────────────────────────────────────────────

create table assessment_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        assessment_type not null,
  version     smallint not null default 1,
  items       jsonb not null default '[]',  -- questions/rubrics
  scoring     jsonb default '{}',           -- scoring rules
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger assessment_templates_updated_at
  before update on assessment_templates
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 10. ASSESSMENT INSTANCES (scheduled for a cohort)
-- ────────────────────────────────────────────────────────────

create table assessment_instances (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references assessment_templates(id),
  cohort_id     uuid not null references cohorts(id) on delete cascade,
  release_date  timestamptz,
  deadline      timestamptz,
  status        assessment_instance_status not null default 'draft',
  created_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 11. ASSESSMENT RESPONSES
-- ────────────────────────────────────────────────────────────

create table assessment_responses (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references assessment_instances(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  responses     jsonb not null default '{}',
  score         numeric(6,2),
  subscores     jsonb default '{}',  -- dimension breakdowns
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid references profiles(id),
  unique (instance_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 12. PEER RATINGS (in-session, per-Gentleman)
-- ────────────────────────────────────────────────────────────

create table peer_ratings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  rater_id    uuid not null references profiles(id) on delete cascade,
  ratee_id    uuid not null references profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  note        text,
  created_at  timestamptz not null default now(),
  unique (session_id, rater_id, ratee_id)
);

-- ────────────────────────────────────────────────────────────
-- 13. PEER 360 RATINGS (comprehensive, Weeks 4/10/13)
-- ────────────────────────────────────────────────────────────

create table peer_360_ratings (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references assessment_instances(id) on delete cascade,
  rater_id    uuid not null references profiles(id) on delete cascade,
  ratee_id    uuid not null references profiles(id) on delete cascade,
  -- Leadership dimensions
  initiative      smallint check (initiative between 1 and 5),
  influence       smallint check (influence between 1 and 5),
  accountability  smallint check (accountability between 1 and 5),
  composure       smallint check (composure between 1 and 5),
  -- Character dimensions
  trustworthiness smallint check (trustworthiness between 1 and 5),
  contribution    smallint check (contribution between 1 and 5),
  vulnerability   smallint check (vulnerability between 1 and 5),
  growth_observed smallint check (growth_observed between 1 and 5),
  -- Open response
  open_feedback   text,
  submitted_at    timestamptz not null default now(),
  unique (instance_id, rater_id, ratee_id)
);

-- ────────────────────────────────────────────────────────────
-- 14. COACH OBSERVATIONS
-- ────────────────────────────────────────────────────────────

create table coach_observations (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  captain_id      uuid not null references profiles(id) on delete cascade,
  gentleman_id    uuid not null references profiles(id) on delete cascade,
  -- Engagement
  engagement      engagement_level,
  participation   participation_quality,
  -- Leadership indicators (observed? yes/no/na)
  behaviors       jsonb default '{}',
  -- Flags
  flags           jsonb default '[]',
  notes           text,
  -- Approval workflow
  approved_by     uuid references profiles(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (session_id, captain_id, gentleman_id)
);

-- ────────────────────────────────────────────────────────────
-- 15. FLAGS (automated + manual)
-- ────────────────────────────────────────────────────────────

create table flags (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  cohort_id         uuid references cohorts(id),
  flag_type         flag_type not null,
  severity          flag_severity not null,
  status            flag_status not null default 'open',
  trigger_data      jsonb default '{}',  -- what triggered it
  triggered_at      timestamptz not null default now(),
  acknowledged_by   uuid references profiles(id),
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,
  resolution_notes  text,
  escalated_at      timestamptz,
  escalated_to      uuid references profiles(id)
);

create index idx_flags_user on flags(user_id);
create index idx_flags_status on flags(status) where status != 'resolved';

-- ────────────────────────────────────────────────────────────
-- 16. LEADERSHIP SCORES (weekly calculation)
-- ────────────────────────────────────────────────────────────

create table leadership_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  week        smallint not null,
  score       numeric(5,2) not null,
  rank        smallint,
  components  jsonb default '{}',  -- category breakdowns
  calculated_at timestamptz not null default now(),
  unique (user_id, cohort_id, week)
);

-- ────────────────────────────────────────────────────────────
-- 17. SQUAD POINTS
-- ────────────────────────────────────────────────────────────

create table squad_points (
  id          uuid primary key default gen_random_uuid(),
  squad_id    uuid not null references squads(id) on delete cascade,
  session_id  uuid references sessions(id),
  points      int not null default 0,
  reason      text,
  awarded_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 18. CHALLENGES (weekly assignments)
-- ────────────────────────────────────────────────────────────

create table challenges (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  session_id  uuid references sessions(id),
  week        smallint not null,
  title       text not null,
  description text,
  difficulty  smallint default 1 check (difficulty between 1 and 3),
  due_date    timestamptz,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 19. CHALLENGE COMPLETIONS
-- ────────────────────────────────────────────────────────────

create table challenge_completions (
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  result       text,
  completed_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 20. PERSONAL PROJECTS (capstone)
-- ────────────────────────────────────────────────────────────

create table personal_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  title       text not null,
  description text,
  status      text default 'planning', -- planning, in_progress, submitted, evaluated
  milestones  jsonb default '[]',
  -- Capstone eval (coach)
  eval_completion   smallint check (eval_completion between 0 and 3),
  eval_ambition     smallint check (eval_ambition between 0 and 3),
  eval_growth       smallint check (eval_growth between 0 and 3),
  evaluated_by      uuid references profiles(id),
  evaluated_at      timestamptz,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger personal_projects_updated_at
  before update on personal_projects
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 21. CONFIRMATION STANDINGS
-- ────────────────────────────────────────────────────────────

create table confirmation_standings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  cohort_id         uuid not null references cohorts(id) on delete cascade,
  -- Hard gates
  gates             jsonb not null default '{}',
  gates_passed      boolean not null default false,
  -- Weighted components (each 0-max_weight)
  challenge_completion    numeric(5,2),
  self_assessment_trajectory numeric(5,2),
  peer_360_average        numeric(5,2),
  leadership_performance  numeric(5,2),
  resolve_efficacy_growth numeric(5,2),
  capstone_quality        numeric(5,2),
  coach_evaluation        numeric(5,2),
  -- Totals
  total_score       numeric(5,2),
  standing          confirmation_standing not null default 'pending',
  -- Override
  override_by       uuid references profiles(id),
  override_reason   text,
  calculated_at     timestamptz not null default now(),
  unique (user_id, cohort_id)
);

-- ────────────────────────────────────────────────────────────
-- 22. CONVERSATIONS (messaging)
-- ────────────────────────────────────────────────────────────

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  type        conversation_type not null,
  -- For squad/cohort chats, link to source
  squad_id    uuid references squads(id) on delete set null,
  cohort_id   uuid references cohorts(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 23. CONVERSATION PARTICIPANTS
-- ────────────────────────────────────────────────────────────

create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  muted           boolean not null default false,
  primary key (conversation_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- 24. MESSAGES
-- ────────────────────────────────────────────────────────────

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,
  content         text not null,
  pinned          boolean not null default false,
  reported        boolean not null default false,
  reported_by     uuid references profiles(id),
  starred         boolean not null default false,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);

create index idx_messages_convo on messages(conversation_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 25. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  channels    notification_channel[] default '{in_app}',
  data        jsonb default '{}',  -- action URL, entity refs
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, created_at desc);
create index idx_notifications_unread on notifications(user_id) where read_at is null;

-- ────────────────────────────────────────────────────────────
-- 26. NOTIFICATION PREFERENCES
-- ────────────────────────────────────────────────────────────

create table notification_preferences (
  user_id           uuid not null references profiles(id) on delete cascade,
  category          text not null,  -- e.g. 'dm', 'assessment', 'flag', etc.
  push_enabled      boolean not null default true,
  email_enabled     boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end   time,
  digest            digest_preference default 'immediate',
  primary key (user_id, category)
);

-- ────────────────────────────────────────────────────────────
-- 27. PAYMENTS
-- ────────────────────────────────────────────────────────────

create table payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  cohort_id       uuid references cohorts(id),
  stripe_payment_id text,
  amount_cents    int not null,
  currency        text not null default 'usd',
  status          payment_status not null default 'pending',
  discount_code   text,
  paid_at         timestamptz,
  failed_at       timestamptz,
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 28. DISCOUNT CODES
-- ────────────────────────────────────────────────────────────

create table discount_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  description text,
  type        text not null default 'percent', -- percent or flat
  value       numeric(8,2) not null,           -- percent off or cents off
  max_uses    int,
  used_count  int not null default 0,
  active      boolean not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 29. EXERCISE LIBRARY (Phase 2 rotation)
-- ────────────────────────────────────────────────────────────

create table exercises (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  phase       cohort_phase not null default 'phase2a',
  duration_min smallint default 60,
  materials   jsonb default '[]',
  template    jsonb default '{}',  -- activity template for session builder
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- Add FK now that exercises table exists
alter table sessions
  add constraint fk_sessions_exercise
  foreign key (exercise_id) references exercises(id);

-- ────────────────────────────────────────────────────────────
-- 30. DOSE METRICS (backend only, Headmaster-visible)
-- ────────────────────────────────────────────────────────────

create table dose_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  week        smallint not null,
  dopamine    numeric(5,2) default 0,  -- goal progress, streaks
  oxytocin    numeric(5,2) default 0,  -- brotherhood, peer connection
  serotonin   numeric(5,2) default 0,  -- recognition, rank
  endorphins  numeric(5,2) default 0,  -- challenge completion
  recommendations jsonb default '[]',  -- generated suggestions
  calculated_at timestamptz not null default now(),
  unique (user_id, cohort_id, week)
);

-- ────────────────────────────────────────────────────────────
-- 31. DOSE WEIGHTS (configurable by Headmaster)
-- ────────────────────────────────────────────────────────────

create table dose_weights (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  dopamine_w  numeric(4,2) not null default 0.25,
  oxytocin_w  numeric(4,2) not null default 0.25,
  serotonin_w numeric(4,2) not null default 0.25,
  endorphins_w numeric(4,2) not null default 0.25,
  active      boolean not null default true,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 32. AUDIT LOG
-- ────────────────────────────────────────────────────────────

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  details     jsonb default '{}',
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_audit_user on audit_log(user_id, created_at desc);
create index idx_audit_entity on audit_log(entity_type, entity_id);

-- ────────────────────────────────────────────────────────────
-- 33. SYSTEM CONFIGURATION (key-value for Headmaster settings)
-- ────────────────────────────────────────────────────────────

create table system_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

-- Seed default flag thresholds
insert into system_config (key, value, description) values
  ('flag_thresholds', '{
    "attendance_drop": {"threshold": 80, "window_weeks": 2},
    "attendance_critical": {"threshold": 60, "consecutive_absences": 2},
    "pulse_decline": {"drop_points": 2},
    "pulse_critical": {"score": 1, "consecutive_weeks": 2},
    "challenge_dropout": {"threshold": 50, "window_weeks": 2},
    "peer_concern": {"threshold": 2.5},
    "peer_critical": {"threshold": 2.0},
    "engagement_gap": {"days": 5},
    "project_stall": {"weeks": 2}
  }', 'Automated flag trigger thresholds'),
  ('confirmation_weights', '{
    "challenge_completion": 20,
    "self_assessment_trajectory": 15,
    "peer_360_average": 15,
    "leadership_performance": 15,
    "resolve_efficacy_growth": 15,
    "capstone_quality": 10,
    "coach_evaluation": 10
  }', 'Confirmation standing component weights'),
  ('confirmation_gates', '{
    "attendance_pct": 75,
    "pulse_completion_pct": 80,
    "capstone_submitted": true,
    "conduct_clear": true,
    "assessments_complete": true
  }', 'Hard gates for Confirmation');

-- ────────────────────────────────────────────────────────────
-- 34. ALUMNI ACCOMPLISHMENTS
-- ────────────────────────────────────────────────────────────

create table alumni_accomplishments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  description text,
  url         text,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 35. CHECK-IN LOG (Captain 1:1s with Gentlemen)
-- ────────────────────────────────────────────────────────────

create table checkin_log (
  id          uuid primary key default gen_random_uuid(),
  captain_id  uuid not null references profiles(id) on delete cascade,
  gentleman_id uuid not null references profiles(id) on delete cascade,
  cohort_id   uuid references cohorts(id),
  notes       text,
  flag_id     uuid references flags(id),  -- if triggered by a flag
  checked_in_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────

-- Get current user's role
create or replace function current_user_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Check if user is leadership (captain, headmaster, officer)
create or replace function is_leadership()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('captain', 'headmaster', 'officer')
  );
$$ language sql stable security definer;

-- Check if user is headmaster
create or replace function is_headmaster()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'headmaster'
  );
$$ language sql stable security definer;

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table cohorts enable row level security;
alter table cohort_members enable row level security;
alter table squads enable row level security;
alter table squad_members enable row level security;
alter table sessions enable row level security;
alter table session_activities enable row level security;
alter table session_attendance enable row level security;
alter table assessment_templates enable row level security;
alter table assessment_instances enable row level security;
alter table assessment_responses enable row level security;
alter table peer_ratings enable row level security;
alter table peer_360_ratings enable row level security;
alter table coach_observations enable row level security;
alter table flags enable row level security;
alter table leadership_scores enable row level security;
alter table squad_points enable row level security;
alter table challenges enable row level security;
alter table challenge_completions enable row level security;
alter table personal_projects enable row level security;
alter table confirmation_standings enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;
alter table payments enable row level security;
alter table audit_log enable row level security;
alter table system_config enable row level security;
alter table dose_metrics enable row level security;
alter table alumni_accomplishments enable row level security;
alter table checkin_log enable row level security;

-- ── PROFILES ──

-- Own profile: full access
create policy "Users read own profile"
  on profiles for select using (id = auth.uid());

create policy "Users update own profile"
  on profiles for update using (id = auth.uid());

-- Leadership: read all profiles
create policy "Leadership reads all profiles"
  on profiles for select using (is_leadership());

-- Headmaster: full CRUD
create policy "Headmaster manages profiles"
  on profiles for all using (is_headmaster());

-- ── COHORTS ──

create policy "Authenticated users read cohorts"
  on cohorts for select using (auth.uid() is not null);

create policy "Headmaster manages cohorts"
  on cohorts for all using (is_headmaster());

-- ── COHORT MEMBERS ──

create policy "Users see own cohort membership"
  on cohort_members for select using (user_id = auth.uid());

create policy "Leadership reads cohort members"
  on cohort_members for select using (is_leadership());

create policy "Headmaster manages cohort members"
  on cohort_members for all using (is_headmaster());

-- ── SQUADS ──

create policy "Authenticated users read squads"
  on squads for select using (auth.uid() is not null);

create policy "Headmaster manages squads"
  on squads for all using (is_headmaster());

-- ── SQUAD MEMBERS ──

create policy "Users see own squad membership"
  on squad_members for select using (user_id = auth.uid());

create policy "Leadership reads squad members"
  on squad_members for select using (is_leadership());

create policy "Headmaster manages squad members"
  on squad_members for all using (is_headmaster());

-- ── SESSIONS ──

create policy "Authenticated users read sessions"
  on sessions for select using (auth.uid() is not null);

create policy "Headmaster manages sessions"
  on sessions for all using (is_headmaster());

-- ── FLAGS ──

create policy "Users see own flags"
  on flags for select using (user_id = auth.uid());

create policy "Leadership reads flags"
  on flags for select using (is_leadership());

create policy "Leadership creates flags"
  on flags for insert with check (is_leadership());

create policy "Leadership updates flags"
  on flags for update using (is_leadership());

-- ── NOTIFICATIONS ──

create policy "Users see own notifications"
  on notifications for select using (user_id = auth.uid());

create policy "Users update own notifications"
  on notifications for update using (user_id = auth.uid());

-- ── MESSAGES ──

create policy "Participants read messages"
  on messages for select using (
    exists (
      select 1 from conversation_participants
      where conversation_id = messages.conversation_id
      and user_id = auth.uid()
    )
  );

create policy "Participants send messages"
  on messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_participants
      where conversation_id = messages.conversation_id
      and user_id = auth.uid()
    )
  );

-- Headmaster reads all messages (audit)
create policy "Headmaster reads all messages"
  on messages for select using (is_headmaster());

-- ── LEADERSHIP SCORES ──

create policy "Users see own scores"
  on leadership_scores for select using (user_id = auth.uid());

create policy "Leadership reads all scores"
  on leadership_scores for select using (is_leadership());

-- ── ASSESSMENT RESPONSES ──

create policy "Users see own responses"
  on assessment_responses for select using (user_id = auth.uid());

create policy "Users submit own responses"
  on assessment_responses for insert with check (user_id = auth.uid());

create policy "Leadership reads responses"
  on assessment_responses for select using (is_leadership());

-- ── PEER RATINGS ──

create policy "Users submit peer ratings"
  on peer_ratings for insert with check (rater_id = auth.uid());

-- Gentleman sees aggregated only (handled in app layer)
create policy "Leadership reads peer ratings"
  on peer_ratings for select using (is_leadership());

-- ── COACH OBSERVATIONS ──

create policy "Captains submit observations"
  on coach_observations for insert with check (captain_id = auth.uid());

create policy "Captains see own observations"
  on coach_observations for select using (captain_id = auth.uid());

create policy "Headmaster reads all observations"
  on coach_observations for select using (is_headmaster());

-- ── PERSONAL PROJECTS ──

create policy "Users manage own projects"
  on personal_projects for all using (user_id = auth.uid());

create policy "Leadership reads projects"
  on personal_projects for select using (is_leadership());

-- ── CONFIRMATION STANDINGS ──

create policy "Users see own standing"
  on confirmation_standings for select using (user_id = auth.uid());

create policy "Headmaster manages standings"
  on confirmation_standings for all using (is_headmaster());

-- ── PAYMENTS ──

create policy "Users see own payments"
  on payments for select using (user_id = auth.uid());

create policy "Headmaster manages payments"
  on payments for all using (is_headmaster());

-- ── AUDIT LOG ──

create policy "Headmaster reads audit log"
  on audit_log for select using (is_headmaster());

create policy "System inserts audit log"
  on audit_log for insert with check (true);  -- service role inserts

-- ── SYSTEM CONFIG ──

create policy "Headmaster manages config"
  on system_config for all using (is_headmaster());

create policy "Authenticated reads config"
  on system_config for select using (auth.uid() is not null);

-- ── DOSE METRICS ──

create policy "Headmaster reads dose"
  on dose_metrics for select using (is_headmaster());

-- ── ALUMNI ACCOMPLISHMENTS ──

create policy "Alumni manage own accomplishments"
  on alumni_accomplishments for all using (user_id = auth.uid());

create policy "Authenticated read accomplishments"
  on alumni_accomplishments for select using (auth.uid() is not null);

-- ── NOTIFICATION PREFERENCES ──

create policy "Users manage own notification prefs"
  on notification_preferences for all using (user_id = auth.uid());

-- ── CHALLENGE COMPLETIONS ──

create policy "Users submit own completions"
  on challenge_completions for insert with check (user_id = auth.uid());

create policy "Users see own completions"
  on challenge_completions for select using (user_id = auth.uid());

create policy "Leadership reads completions"
  on challenge_completions for select using (is_leadership());

-- ── CHALLENGES ──

create policy "Authenticated read challenges"
  on challenges for select using (auth.uid() is not null);

create policy "Headmaster manages challenges"
  on challenges for all using (is_headmaster());

-- ── CHECKIN LOG ──

create policy "Captains manage own checkins"
  on checkin_log for all using (captain_id = auth.uid());

create policy "Headmaster reads all checkins"
  on checkin_log for select using (is_headmaster());

-- ── CONVERSATION PARTICIPANTS ──

create policy "Users see own conversations"
  on conversation_participants for select using (user_id = auth.uid());

create policy "Headmaster reads all participants"
  on conversation_participants for select using (is_headmaster());

-- ── CONVERSATIONS ──

create policy "Users see own conversations"
  on conversations for select using (
    exists (
      select 1 from conversation_participants
      where conversation_id = conversations.id
      and user_id = auth.uid()
    )
  );

create policy "Headmaster reads all conversations"
  on conversations for select using (is_headmaster());

-- ── SESSION ACTIVITIES ──

create policy "Authenticated read activities"
  on session_activities for select using (auth.uid() is not null);

create policy "Headmaster manages activities"
  on session_activities for all using (is_headmaster());

-- ── SESSION ATTENDANCE ──

create policy "Users see own attendance"
  on session_attendance for select using (user_id = auth.uid());

create policy "Leadership reads attendance"
  on session_attendance for select using (is_leadership());

create policy "Headmaster manages attendance"
  on session_attendance for all using (is_headmaster());

-- ── ASSESSMENT TEMPLATES ──

create policy "Authenticated read templates"
  on assessment_templates for select using (auth.uid() is not null);

create policy "Headmaster manages templates"
  on assessment_templates for all using (is_headmaster());

-- ── ASSESSMENT INSTANCES ──

create policy "Authenticated read instances"
  on assessment_instances for select using (auth.uid() is not null);

create policy "Headmaster manages instances"
  on assessment_instances for all using (is_headmaster());

-- ── PEER 360 RATINGS ──

create policy "Users submit 360 ratings"
  on peer_360_ratings for insert with check (rater_id = auth.uid());

create policy "Leadership reads 360 ratings"
  on peer_360_ratings for select using (is_leadership());

-- ── SQUAD POINTS ──

create policy "Authenticated read squad points"
  on squad_points for select using (auth.uid() is not null);

create policy "Headmaster manages squad points"
  on squad_points for all using (is_headmaster());

-- ── DOSE WEIGHTS ──

alter table dose_weights enable row level security;

create policy "Headmaster manages dose weights"
  on dose_weights for all using (is_headmaster());

-- ── EXERCISES ──

alter table exercises enable row level security;

create policy "Authenticated read exercises"
  on exercises for select using (auth.uid() is not null);

create policy "Headmaster manages exercises"
  on exercises for all using (is_headmaster());

-- ── DISCOUNT CODES ──

alter table discount_codes enable row level security;

create policy "Headmaster manages discount codes"
  on discount_codes for all using (is_headmaster());

-- ────────────────────────────────────────────────────────────
-- AUTO-CREATE PROFILE ON SIGNUP
-- ────────────────────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
