-- 0069_daily_checklist — the Daily Checklist module (WMS overhaul, Phase 3).
-- Idempotent: safe to re-run. See migration-journal-out-of-sync memory.

CREATE TABLE IF NOT EXISTS "daily_checklist" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id"     uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "plan_date"       date NOT NULL,
  "goal_id"         uuid REFERENCES "weekly_goals"("id") ON DELETE SET NULL,
  "task_id"         uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
  "origin"          text NOT NULL DEFAULT 'standalone',
  "title"           text NOT NULL,
  "client"          text,
  "subject"         text,
  "position"        integer NOT NULL DEFAULT 1,
  "status"          "task_status" NOT NULL DEFAULT 'not_started',
  "done"            boolean NOT NULL DEFAULT false,
  "done_note"       text,
  "committed_at"    timestamptz NOT NULL DEFAULT now(),
  "closed_at"       timestamptz,
  "moved_from_date" date,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "daily_checklist_emp_date_idx" ON "daily_checklist" ("employee_id", "plan_date");
CREATE INDEX IF NOT EXISTS "daily_checklist_date_idx" ON "daily_checklist" ("plan_date");
CREATE UNIQUE INDEX IF NOT EXISTS "daily_checklist_emp_date_goal_idx" ON "daily_checklist" ("employee_id", "plan_date", "goal_id");
