-- 0074_training_centre — Training Centre: material library + test engine +
-- induction + feedback CRM (Training workspace). Idempotent + additive.

CREATE TABLE IF NOT EXISTS "tc_subjects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_subjects_active_idx" ON "tc_subjects" ("is_active","sort_order","name");

CREATE TABLE IF NOT EXISTS "tc_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_services_active_idx" ON "tc_services" ("is_active","sort_order","name");

CREATE TABLE IF NOT EXISTS "tc_materials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "added_on" date NOT NULL DEFAULT CURRENT_DATE,
  "subject_id" uuid REFERENCES "tc_subjects"("id") ON DELETE SET NULL,
  "los" text,
  "file_path" text,
  "file_name" text,
  "file_type" text,
  "video_url" text,
  "notes" text,
  "version" text,
  "version_notes" text,
  "created_by_ids" uuid[] NOT NULL DEFAULT '{}',
  "assisted_by_ids" uuid[] NOT NULL DEFAULT '{}',
  "part_of_induction" boolean NOT NULL DEFAULT false,
  "induction_dept_ids" uuid[] NOT NULL DEFAULT '{}',
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_materials_subject_idx" ON "tc_materials" ("subject_id");
CREATE INDEX IF NOT EXISTS "tc_materials_induction_idx" ON "tc_materials" ("part_of_induction");
CREATE INDEX IF NOT EXISTS "tc_materials_created_idx" ON "tc_materials" ("created_at");

CREATE TABLE IF NOT EXISTS "tc_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "material_id" uuid NOT NULL REFERENCES "tc_materials"("id") ON DELETE CASCADE,
  "kind" integer NOT NULL,
  "title" text,
  "pass_mark" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_tests_material_kind_uq" ON "tc_tests" ("material_id","kind");

CREATE TABLE IF NOT EXISTS "tc_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "test_id" uuid NOT NULL REFERENCES "tc_tests"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "prompt" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "correct_answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "marks" integer NOT NULL DEFAULT 1,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_questions_test_idx" ON "tc_questions" ("test_id","position");

CREATE TABLE IF NOT EXISTS "tc_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "test_id" uuid NOT NULL REFERENCES "tc_tests"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "passed" boolean NOT NULL,
  "answers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "taken_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_attempts_emp_test_idx" ON "tc_attempts" ("employee_id","test_id","taken_at");

CREATE TABLE IF NOT EXISTS "tc_watch_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "material_id" uuid NOT NULL REFERENCES "tc_materials"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "watched_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_watch_material_emp_uq" ON "tc_watch_progress" ("material_id","employee_id");

CREATE TABLE IF NOT EXISTS "tc_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feedback_date" date NOT NULL DEFAULT CURRENT_DATE,
  "rated_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "rated_name" text,
  "client_name" text,
  "service_id" uuid REFERENCES "tc_services"("id") ON DELETE SET NULL,
  "type" text NOT NULL,
  "rating" integer,
  "q1" text,
  "q2" text,
  "voice_note_path" text,
  "voice_transcript" text,
  "picture_path" text,
  "escalate" boolean NOT NULL DEFAULT false,
  "escalated_to_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "resolution" boolean NOT NULL DEFAULT false,
  "resolution_how" text,
  "signed_off" boolean NOT NULL DEFAULT false,
  "signed_off_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "signed_off_at" timestamptz,
  "archived" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'open',
  "resolved_at" timestamptz,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tc_feedback_status_idx" ON "tc_feedback" ("status");
CREATE INDEX IF NOT EXISTS "tc_feedback_created_idx" ON "tc_feedback" ("created_at");
CREATE INDEX IF NOT EXISTS "tc_feedback_service_idx" ON "tc_feedback" ("service_id");

-- Seeds (idempotent, case-insensitive).
INSERT INTO "tc_subjects" ("name","sort_order")
  SELECT v.name, v.ord FROM (VALUES
    ('Sales',1),('Operations',2),('Back Office',3),('PSO',4),('Consulting',5),
    ('HR/Admin',6),('Policy',7),('Recruiter',8),('Systems',9),('Branding',10),
    ('Marketing',11),('Content Creation',12)
  ) AS v(name,ord)
  WHERE NOT EXISTS (SELECT 1 FROM "tc_subjects" s WHERE lower(s.name) = lower(v.name));

INSERT INTO "tc_services" ("name","sort_order")
  SELECT v.name, v.ord FROM (VALUES
    ('PSO',1),('BSS',2),('Consulting',3),('Systems',4),('Internal Office',5),('Other',6)
  ) AS v(name,ord)
  WHERE NOT EXISTS (SELECT 1 FROM "tc_services" s WHERE lower(s.name) = lower(v.name));
