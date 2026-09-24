-- ════════════════════════════════════════════════════════════════════════════
-- 0248 — Training & Learning (LMS) — extend the Training Centre.
--
-- WHY
--   The Training Centre (0074/0075/0096) already owns the material library,
--   test engine, session calendar, attendance, feedback CRM, self-learning and
--   weekly shares. This migration extends those tables with the missing LMS
--   semantics and adds the genuinely-new entities, so the module is extended in
--   place rather than duplicated:
--
--     · tc_sessions gains function, training type, an explicit audience scope
--       and the recurrence columns the Tasks module already uses.
--     · tc_session_attendees gains required/optional + a self check-in time.
--     · tc_watch_progress gains real second-level progress (was a boolean).
--     · tc_self_learning gains clock times + function + source (so learning can
--       be validated against office hours).
--     · NEW: anonymous per-training feedback surveys, per-role learning targets
--       with history, and a daily learning-share schedule with attendance.
--
--   All additive and idempotent. No existing column or row is touched.
-- ════════════════════════════════════════════════════════════════════════════

-- ── tc_sessions ──────────────────────────────────────────────────────────────
ALTER TABLE "tc_sessions" ADD COLUMN IF NOT EXISTS "function_id" uuid REFERENCES "functions"("id") ON DELETE SET NULL;
ALTER TABLE "tc_sessions" ADD COLUMN IF NOT EXISTS "training_type" text NOT NULL DEFAULT 'other';
ALTER TABLE "tc_sessions" ADD COLUMN IF NOT EXISTS "audience_scope" text NOT NULL DEFAULT 'my_team';
ALTER TABLE "tc_sessions" ADD COLUMN IF NOT EXISTS "recurrence_rule" text;
ALTER TABLE "tc_sessions" ADD COLUMN IF NOT EXISTS "recurrence_parent_id" uuid;
ALTER TABLE "tc_sessions" ADD COLUMN IF NOT EXISTS "recurrence_occurrence_date" text;
CREATE INDEX IF NOT EXISTS "tc_sessions_function_idx" ON "tc_sessions" ("function_id");

-- ── tc_session_attendees ─────────────────────────────────────────────────────
ALTER TABLE "tc_session_attendees" ADD COLUMN IF NOT EXISTS "required" boolean NOT NULL DEFAULT true;
ALTER TABLE "tc_session_attendees" ADD COLUMN IF NOT EXISTS "join_time" timestamptz;

-- ── tc_watch_progress — boolean "watched" → second-level progress ─────────────
ALTER TABLE "tc_watch_progress" ADD COLUMN IF NOT EXISTS "video_duration_sec" integer NOT NULL DEFAULT 0;
ALTER TABLE "tc_watch_progress" ADD COLUMN IF NOT EXISTS "watched_sec" integer NOT NULL DEFAULT 0;
ALTER TABLE "tc_watch_progress" ADD COLUMN IF NOT EXISTS "last_position_sec" integer NOT NULL DEFAULT 0;

-- ── tc_self_learning ─────────────────────────────────────────────────────────
ALTER TABLE "tc_self_learning" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "tc_self_learning" ADD COLUMN IF NOT EXISTS "start_time" time;
ALTER TABLE "tc_self_learning" ADD COLUMN IF NOT EXISTS "end_time" time;
ALTER TABLE "tc_self_learning" ADD COLUMN IF NOT EXISTS "function_id" uuid REFERENCES "functions"("id") ON DELETE SET NULL;

-- ── Anonymous per-training feedback surveys ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "tc_training_surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "tc_sessions"("id") ON DELETE CASCADE,
  "title" text,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_training_surveys_session_uq" ON "tc_training_surveys" ("session_id");

CREATE TABLE IF NOT EXISTS "tc_survey_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "survey_id" uuid NOT NULL REFERENCES "tc_training_surveys"("id") ON DELETE CASCADE,
  "prompt" text NOT NULL,
  "type" text NOT NULL DEFAULT 'rating',
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_survey_questions_survey_idx" ON "tc_survey_questions" ("survey_id", "position");

CREATE TABLE IF NOT EXISTS "tc_survey_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "survey_id" uuid NOT NULL REFERENCES "tc_training_surveys"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "tc_survey_questions"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "rating" smallint,
  "comment" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_survey_responses_q_emp_uq" ON "tc_survey_responses" ("question_id", "employee_id");
CREATE INDEX IF NOT EXISTS "tc_survey_responses_survey_idx" ON "tc_survey_responses" ("survey_id");

-- ── Per-role learning targets (history-preserving: effective_from/effective_to) ─
CREATE TABLE IF NOT EXISTS "tc_learning_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_group" text NOT NULL,
  "metric" text NOT NULL,
  "value" numeric(8,2) NOT NULL,
  "unit" text NOT NULL DEFAULT 'count',
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_learning_targets_role_metric_idx" ON "tc_learning_targets" ("role_group", "metric", "effective_from");

-- ── Daily learning-share schedule (rotation + attendance) ────────────────────
CREATE TABLE IF NOT EXISTS "tc_share_schedule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "share_date" date NOT NULL,
  "slot" text NOT NULL DEFAULT 'junior',
  "presenter_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "topic" text,
  "function_id" uuid REFERENCES "functions"("id") ON DELETE SET NULL,
  "los" text,
  "key_takeaway" text,
  "source" text,
  "recording_path" text,
  "status" text NOT NULL DEFAULT 'scheduled',
  "replaced_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_share_schedule_date_slot_uq" ON "tc_share_schedule" ("share_date", "slot");
CREATE INDEX IF NOT EXISTS "tc_share_schedule_date_idx" ON "tc_share_schedule" ("share_date");
CREATE INDEX IF NOT EXISTS "tc_share_schedule_presenter_idx" ON "tc_share_schedule" ("presenter_id");

CREATE TABLE IF NOT EXISTS "tc_share_attendees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "share_schedule_id" uuid NOT NULL REFERENCES "tc_share_schedule"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'present',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_share_attendees_share_emp_uq" ON "tc_share_attendees" ("share_schedule_id", "employee_id");
CREATE INDEX IF NOT EXISTS "tc_share_attendees_emp_idx" ON "tc_share_attendees" ("employee_id");
