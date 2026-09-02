-- 0095 — PMS / Employee Intelligence (Layer 2, ARCHITECTURE.md Laws 1,4,5,8,10).
--
-- ALL ADDITIVE. No existing table is altered or dropped. Idempotent. Safe to
-- re-run, and safe to apply to a live system with zero user-facing change.
--
-- Layer 2 (Intelligence): every PMS row is DERIVED + rebuildable. The projection
-- tables (employee_twin, employee_score_daily) carry NO foreign keys back to the
-- operational rows — they are rebuilt purely by replaying event_log (Law 4), and
-- must outlive any aggregate. The pms_* human tables (config/review/recognition/
-- promotion) are operational decisions a human makes ABOUT the intelligence, so
-- they MAY reference employees(id). PMS fires ZERO external effects (Law 8):
-- promotion + recognition are human-released rows, never auto-actioned.
--
-- NO POLICY IN CODE: pms_score_config is the SINGLE source of every weight,
-- threshold and coefficient. The seed below is an editable STARTING POINT stored
-- as data — the engines read it at call time, so changing it needs no deploy.

-- ─────────────────────────────────────────────────────────────────────────
-- employee_twin — the rolled-up CURRENT intelligence snapshot per employee, a
-- rebuildable projection over the five employee-domain event families
-- (attendance / goal / dcc / training / feedback). Keyed by employee_id. NO FK:
-- a projection must be replayable from the log even for a deleted employee.
-- Tasks are NOT duplicated here — the score engine reads the existing
-- task_metrics_daily projection at score time.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists employee_twin (
  employee_id              uuid primary key,
  org_id                   text,
  -- attendance
  presence_days            integer not null default 0,
  late_count               integer not null default 0,
  punctual_days            integer not null default 0,
  -- goals (weight-aware; eff% = COALESCE(accept_pct, pct_done))
  goal_eff_sum_weighted    numeric(14,2) not null default 0,
  goal_weight_sum          numeric(14,2) not null default 0,
  goals_completed          integer not null default 0,
  goals_filled_on_time     integer not null default 0,
  goal_progress_events     integer not null default 0,
  -- dcc
  dcc_due_count            integer not null default 0,
  dcc_done_count           integer not null default 0,
  -- training
  tests_passed             integer not null default 0,
  tests_attempted          integer not null default 0,
  materials_watched        integer not null default 0,
  -- feedback
  feedback_count           integer not null default 0,
  feedback_rating_sum      numeric(14,2) not null default 0,
  feedback_resolved        integer not null default 0,
  feedback_tat_sum         numeric(14,2) not null default 0,
  last_event_at            timestamptz,
  updated_at               timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- employee_score_daily — the rebuildable HISTORY: the same raw counters bucketed
-- by event-day. The twin is the current roll-up; this is the per-day series the
-- score-trend chart reads. Keyed by (day, employee_id). NO FK.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists employee_score_daily (
  day                      date not null,
  employee_id              uuid not null,
  org_id                   text,
  presence_days            integer not null default 0,
  late_count               integer not null default 0,
  punctual_days            integer not null default 0,
  goal_eff_sum_weighted    numeric(14,2) not null default 0,
  goal_weight_sum          numeric(14,2) not null default 0,
  goals_completed          integer not null default 0,
  goals_filled_on_time     integer not null default 0,
  goal_progress_events     integer not null default 0,
  dcc_due_count            integer not null default 0,
  dcc_done_count           integer not null default 0,
  tests_passed             integer not null default 0,
  tests_attempted          integer not null default 0,
  materials_watched        integer not null default 0,
  feedback_count           integer not null default 0,
  feedback_rating_sum      numeric(14,2) not null default 0,
  feedback_resolved        integer not null default 0,
  feedback_tat_sum         numeric(14,2) not null default 0,
  updated_at               timestamptz not null default now(),
  primary key (day, employee_id)
);
create index if not exists employee_score_daily_emp_idx on employee_score_daily (employee_id);
create index if not exists employee_score_daily_day_idx on employee_score_daily (day);

-- ─────────────────────────────────────────────────────────────────────────
-- pms_score_config — THE single, admin-editable source of all PMS policy. One
-- singleton row (id='default'). weights/thresholds/formula are jsonb so the
-- shape can grow without a migration. The score/promotion/recognition engines
-- are PURE functions of this row — no weight or threshold is ever hardcoded.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists pms_score_config (
  id             text primary key default 'default',
  weights        jsonb not null default '{}'::jsonb,
  thresholds     jsonb not null default '{}'::jsonb,
  formula        jsonb not null default '{}'::jsonb,
  updated_by_id  uuid references employees(id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- pms_review — a human manager's periodic review of an employee. Operational
-- decision ABOUT the intelligence; one per (employee, period).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists pms_review (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  period        text not null,                       -- e.g. '2026-06' (month) or a quarter key
  reviewer_id   uuid references employees(id) on delete set null,
  rating        smallint,                            -- 1..5, nullable while draft
  status        text not null default 'draft',       -- draft | acknowledged | needs_rework
  strengths     text,
  improvements  text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, period)
);
create index if not exists pms_review_employee_idx on pms_review (employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- pms_recognition — a SUGGESTED recognition the engine flags; a human RELEASES
-- or dismisses it. Never auto-released (Law 8). Score snapshot at suggest time.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists pms_recognition (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  period          text not null,
  kind            text not null,                     -- 'top_performer' | 'most_improved' | ...
  reason          text,
  score_snapshot  numeric(6,2),
  status          text not null default 'suggested', -- suggested | released | dismissed
  released_by_id  uuid references employees(id) on delete set null,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pms_recognition_employee_idx on pms_recognition (employee_id);
create index if not exists pms_recognition_period_idx on pms_recognition (period);

-- ─────────────────────────────────────────────────────────────────────────
-- pms_promotion_signal — a FLAGGED promotion signal (eligibility crossed a
-- config threshold). A human acknowledges/actions/dismisses it; the system NEVER
-- promotes anyone (Law 8). One open signal per (employee, status).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists pms_promotion_signal (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  score_snapshot  numeric(6,2),
  eligible_since  timestamptz,
  rationale       text,
  status          text not null default 'flagged',   -- flagged | acknowledged | actioned | dismissed
  decided_by_id   uuid references employees(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, status)
);
create index if not exists pms_promotion_signal_employee_idx on pms_promotion_signal (employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Seed the singleton config. Comprehensive weighting across every signal, stored
-- as DATA and fully editable by an admin — NOT policy baked into code. The
-- weights are relative (the engine normalises by their sum); thresholds gate the
-- human-released promotion/recognition signals; formula coeffs let an admin tune
-- each pillar's curve. ON CONFLICT DO NOTHING so re-runs never clobber edits.
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  insert into pms_score_config (id, weights, thresholds, formula)
  values (
    'default',
    '{"attendance":20,"goals":30,"dcc":15,"tasks":20,"training":7,"feedback":8}'::jsonb,
    '{"promotionScore":85,"recognitionScore":90,"lateGraceDays":3,"onTimeRateFloor":0.8,"minTenureDays":180}'::jsonb,
    '{"punctualityCoeff":1.0,"goalAchievementCoeff":1.0,"dccComplianceCoeff":1.0,"taskOnTimeCoeff":1.0,"testPassCoeff":1.0,"feedbackCoeff":1.0}'::jsonb
  )
  on conflict (id) do nothing;
end $$;
