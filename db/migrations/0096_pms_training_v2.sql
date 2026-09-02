-- 0096 — PMS rating model v2 + Training engine (ARCHITECTURE.md Laws 1,4,5,8,10).
--
-- ALL ADDITIVE. No existing table is dropped or has a column removed. Idempotent;
-- safe to re-run and safe on a live system. Two parts:
--
--   (A) Training engine — the operational tables behind the Training Centre
--       overhaul: a training CALENDAR (sessions), per-attendee attendance the
--       trainer can edit, trainer feedback, post-training assessment (<80% =
--       fail → redo, waivable), self-learning log, and the weekly 10-min Share.
--       These are operational (people act on them) so they MAY reference
--       employees(id). They emit events for the Layer-2 twin where useful.
--
--   (B) PMS rating model v2 — the real policy from leadership's notes: a 5-pillar
--       score out of 100 (KPI 50 · Skill-Upgrade 20 · Compliance 10 · Attitude 10
--       · Team-Work 10). Adds the monthly 360 review (attitude/behaviour/skill,
--       manager + subordinate + peer) and personal non-work goals, and migrates
--       the singleton pms_score_config from the generic v1 shape to this model.
--       Still NO policy in code — every weight/threshold/curve lives in the config
--       row, editable in /pms/config with no deploy.

-- ════════════════════════════════════════════════════════════════════════════
-- (A) TRAINING ENGINE
-- ════════════════════════════════════════════════════════════════════════════

-- tc_sessions — the Training Calendar. One scheduled (or completed) session.
-- Subject/Topic/LOS/Criticality(1-5★)/Who(trainer)/Schedule/Duration; video+ppt
-- uploads; in_manual = the ★ that promotes a session into the training manual.
-- No session > 1.5h is enforced in the app (duration_min); prefer Fri/Sat.
create table if not exists tc_sessions (
  id                   uuid primary key default gen_random_uuid(),
  subject_id           uuid references tc_subjects(id) on delete set null,
  topic                text not null,
  los                  text,                              -- learning-outcome statements
  criticality          smallint not null default 3,       -- 1..5 ★
  trainer_id           uuid references employees(id) on delete set null,  -- "Who"
  scheduled_at         timestamptz not null,
  duration_min         integer not null default 60,       -- ≤ 90 enforced in app
  mode                 text not null default 'in_person',  -- in_person | online
  location             text,
  meeting_url          text,
  video_path           text,                              -- recording / video upload
  ppt_path             text,                              -- photo / PPT
  status               text not null default 'scheduled', -- scheduled | done | cancelled
  in_manual            boolean not null default false,    -- ★ added to the training manual
  material_id          uuid references tc_materials(id) on delete set null,  -- optional library link
  recording_requested  boolean not null default false,    -- "request for recording"
  notes                text,
  created_by_id        uuid references employees(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists tc_sessions_scheduled_idx on tc_sessions (scheduled_at);
create index if not exists tc_sessions_trainer_idx on tc_sessions (trainer_id);
create index if not exists tc_sessions_status_idx on tc_sessions (status);

-- tc_session_attendees — who is invited / attended. attended_min lets the trainer
-- change attendance & duration if someone left halfway (status 'left_halfway').
create table if not exists tc_session_attendees (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references tc_sessions(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  status        text not null default 'invited',  -- invited | attended | left_halfway | absent
  attended_min  integer,                          -- trainer-editable actual minutes
  marked_by_id  uuid references employees(id) on delete set null,
  marked_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (session_id, employee_id)
);
create index if not exists tc_session_attendees_emp_idx on tc_session_attendees (employee_id);
create index if not exists tc_session_attendees_session_idx on tc_session_attendees (session_id);

-- tc_session_feedback — an attendee's feedback ON a session (trainer feedback loop):
-- Content/Depth/Understanding/Applicability each 1..5★, plus learn / improve text.
create table if not exists tc_session_feedback (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references tc_sessions(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  content        smallint,        -- 1..5
  depth          smallint,
  understanding  smallint,
  applicability  smallint,
  learned        text,            -- "What did you learn"
  improve        text,            -- "What can be improved"
  created_at     timestamptz not null default now(),
  unique (session_id, employee_id)
);
create index if not exists tc_session_feedback_session_idx on tc_session_feedback (session_id);

-- tc_assessments — the post-training assessment ("Manan's Assessment"). score < the
-- configured pass % (default 80) ⇒ fail ⇒ must redo, with an option to waive off.
-- Target vs Actual captured. redo_of_id chains a redo to its failed attempt.
create table if not exists tc_assessments (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references tc_sessions(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  score          smallint,                         -- actual % (0..100)
  target         smallint,                         -- target % (Target vs Actual)
  passed         boolean,                          -- score >= pass% (or waived)
  waived         boolean not null default false,
  waived_by_id   uuid references employees(id) on delete set null,
  redo_of_id     uuid references tc_assessments(id) on delete set null,
  assessed_by_id uuid references employees(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tc_assessments_emp_idx on tc_assessments (employee_id);
create index if not exists tc_assessments_session_idx on tc_assessments (session_id);

-- tc_self_learning — everyone logs ~1–2 hrs/month of self learning (books/videos/YT)
-- WITH evidence. Feeds the Skill-Upgrade pillar.
create table if not exists tc_self_learning (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  learn_date     date not null,
  kind           text not null default 'book',     -- book | video | youtube | other
  title          text not null,
  source_url     text,
  minutes        integer not null default 0,
  evidence_path  text,                             -- uploaded proof
  evidence_url   text,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists tc_self_learning_emp_idx on tc_self_learning (employee_id, learn_date);

-- tc_shares — the weekly Share: 10 mins compulsory once/week, with a video.
create table if not exists tc_shares (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  week_start   date not null,            -- Monday (IST)
  topic        text not null,
  minutes      integer not null default 10,
  video_path   text,
  video_url    text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, week_start)
);
create index if not exists tc_shares_emp_idx on tc_shares (employee_id, week_start);

-- tc_share_feedback — peer feedback (1..5★) on a weekly Share.
create table if not exists tc_share_feedback (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references tc_shares(id) on delete cascade,
  rater_id    uuid not null references employees(id) on delete cascade,
  rating      smallint,        -- 1..5
  comment     text,
  created_at  timestamptz not null default now(),
  unique (share_id, rater_id)
);
create index if not exists tc_share_feedback_share_idx on tc_share_feedback (share_id);

-- ════════════════════════════════════════════════════════════════════════════
-- (B) PMS RATING MODEL v2 — monthly 360 review + personal goals
-- ════════════════════════════════════════════════════════════════════════════

-- pms_monthly_review — the monthly Attitude/Behaviour/Skill review. One row per
-- (subject, reviewer, relation, period). relation captures the 360 direction:
--   manager     — the subject's manager rates DOWN (feeds the Attitude pillar)
--   subordinate — a report rates UP (the manager being reviewed)  } feed Team-Work
--   peer        — a colleague/junior rates across                 }
--   self        — self-assessment
-- Each of attitude/behaviour/skill is 3..5 (min 3, max 5). change_tags = the
-- "what needs change" dropdown picks (+ free-text via explanation). scope =
-- internal | external.
create table if not exists pms_monthly_review (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references employees(id) on delete cascade,
  reviewer_id   uuid references employees(id) on delete set null,
  relation      text not null default 'manager',   -- manager | subordinate | peer | self
  period        text not null,                      -- 'YYYY-MM'
  attitude      smallint,                           -- 3..5
  behaviour     smallint,                           -- 3..5
  skill         smallint,                           -- 3..5
  change_tags   jsonb not null default '[]'::jsonb, -- ["Punctuality","Ownership",...]
  explanation   text,
  scope         text not null default 'internal',   -- internal | external
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (subject_id, reviewer_id, relation, period)
);
create index if not exists pms_monthly_review_subject_idx on pms_monthly_review (subject_id, period);
create index if not exists pms_monthly_review_reviewer_idx on pms_monthly_review (reviewer_id);

-- pms_personal_goal — up to 3 personal (non-work) goals per person per period.
create table if not exists pms_personal_goal (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  period       text not null,                       -- 'YYYY-MM' or 'YYYY'
  title        text not null,
  detail       text,
  status       text not null default 'active',      -- active | done | dropped
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pms_personal_goal_emp_idx on pms_personal_goal (employee_id, period);

-- ─────────────────────────────────────────────────────────────────────────
-- Migrate the singleton config from the v1 generic shape (attendance/goals/dcc/
-- tasks/training/feedback) to the v2 model from leadership's notes. The defaults
-- ARE the real policy (50/20/10/10/10) — "never a hollow shell" — but every value
-- stays editable as data. Insert if missing; migrate only rows still on the v1
-- shape (presence of the 'attendance' weight key) so we never clobber an admin's
-- v2 edits on re-run.
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  -- create the singleton straight onto v2 if it does not exist yet
  insert into pms_score_config (id, weights, thresholds, formula)
  values (
    'default',
    '{"kpi":50,"skillUpgrade":20,"compliance":10,"attitude":10,"teamwork":10}'::jsonb,
    '{"promotionScore":85,"recognitionScore":90,"minTenureDays":180,"trainGiveHoursPerMonth":4,"trainAttendHoursPerMonth":8,"selfLearnHoursPerMonth":1.5,"shareMinPerWeek":10,"assessmentPassPct":80,"noScheduleAlertDays":6,"noAttendPromptDays":7,"maxSessionMinutes":90,"lateGraceDays":3,"onTimeRateFloor":0.8}'::jsonb,
    '{"kpiWeeklyWeight":1,"kpiIncentiveWeight":1,"skillAttendWeight":2,"skillGiveWeight":1,"skillSelfLearnWeight":1,"skillShareWeight":1,"compDccWeight":1,"compChecklistWeight":1,"ratingFloor":1,"ratingCeil":5}'::jsonb
  )
  on conflict (id) do nothing;

  -- migrate the v1 seed (only while it still carries the old 'attendance' weight)
  update pms_score_config
  set weights    = '{"kpi":50,"skillUpgrade":20,"compliance":10,"attitude":10,"teamwork":10}'::jsonb,
      thresholds = '{"promotionScore":85,"recognitionScore":90,"minTenureDays":180,"trainGiveHoursPerMonth":4,"trainAttendHoursPerMonth":8,"selfLearnHoursPerMonth":1.5,"shareMinPerWeek":10,"assessmentPassPct":80,"noScheduleAlertDays":6,"noAttendPromptDays":7,"maxSessionMinutes":90,"lateGraceDays":3,"onTimeRateFloor":0.8}'::jsonb,
      formula    = '{"kpiWeeklyWeight":1,"kpiIncentiveWeight":1,"skillAttendWeight":2,"skillGiveWeight":1,"skillSelfLearnWeight":1,"skillShareWeight":1,"compDccWeight":1,"compChecklistWeight":1,"ratingFloor":1,"ratingCeil":5}'::jsonb,
      updated_at = now()
  where id = 'default'
    and (weights ? 'attendance');
end $$;
