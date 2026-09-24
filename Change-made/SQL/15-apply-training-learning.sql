-- ════════════════════════════════════════════════════════════════════════════
-- 15 — Training & Learning (LMS) — apply. Mirrors db/migrations/0248_training_learning.sql.
-- Additive and idempotent (IF NOT EXISTS everywhere). Safe to run repeatedly.
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

-- ── Per-role learning targets (history-preserving) ───────────────────────────
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

-- ── 0249 — link a share back to its self-learning entry ──────────────────────
ALTER TABLE "tc_shares" ADD COLUMN IF NOT EXISTS "self_learning_id" uuid REFERENCES "tc_self_learning"("id") ON DELETE SET NULL;
ALTER TABLE "tc_share_schedule" ADD COLUMN IF NOT EXISTS "self_learning_id" uuid REFERENCES "tc_self_learning"("id") ON DELETE SET NULL;

-- ── 0250 — writable master data (training types, audience, slots, sources) ────
CREATE TABLE IF NOT EXISTS "tc_lookups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL,
  "value" text NOT NULL,
  "label" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_lookups_kind_value_uq" ON "tc_lookups" ("kind", "value");
CREATE INDEX IF NOT EXISTS "tc_lookups_kind_active_idx" ON "tc_lookups" ("kind", "is_active", "sort_order");

INSERT INTO "tc_lookups" ("kind", "value", "label", "sort_order") VALUES
  ('training_type', 'technical',   'Technical',   10),
  ('training_type', 'soft_skills', 'Soft Skills', 20),
  ('training_type', 'product',     'Product',     30),
  ('training_type', 'process',     'Process',     40),
  ('training_type', 'compliance',  'Compliance',  50),
  ('training_type', 'induction',   'Induction',   60),
  ('training_type', 'other',       'Other',       70),
  ('audience_scope', 'my_team',            'My Team',            10),
  ('audience_scope', 'another_team',       'Another Team',       20),
  ('audience_scope', 'multiple_teams',     'Multiple Teams',     30),
  ('audience_scope', 'function',           'Function',           40),
  ('audience_scope', 'selected_employees', 'Selected Employees', 50),
  ('audience_scope', 'everyone',           'Everyone',           60),
  ('share_slot', 'junior', 'Juniors (1:30 PM)',     10),
  ('share_slot', 'tl',     'Team Leads (1:40 PM)',  20),
  ('self_learning_source', 'youtube',           'YouTube',          10),
  ('self_learning_source', 'course',            'Course',           20),
  ('self_learning_source', 'book',              'Book',             30),
  ('self_learning_source', 'article',           'Article',          40),
  ('self_learning_source', 'documentation',     'Documentation',    50),
  ('self_learning_source', 'podcast',           'Podcast',          60),
  ('self_learning_source', 'ai',                'AI',               70),
  ('self_learning_source', 'certification',     'Certification',    80),
  ('self_learning_source', 'workshop',          'Workshop',         90),
  ('self_learning_source', 'internal_material', 'Internal Material', 100),
  ('self_learning_source', 'other',             'Other',           110)
ON CONFLICT ("kind", "value") DO NOTHING;
