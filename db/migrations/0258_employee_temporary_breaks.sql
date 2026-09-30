-- 0258 — Employee temporary-break lifecycle.
-- Additive and reversible by dropping only this new table. It never rewrites
-- employee employment/login history; the application changes manager_id only
-- while a break is active and restores from previous_manager_id on return.

CREATE TABLE IF NOT EXISTS "employee_temporary_breaks" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id"         uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "break_from"          date NOT NULL,
  "expected_return"     date,
  "reason"              text,
  "previous_manager_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "started_by_id"       uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "ended_at"            timestamptz,
  "ended_by_id"         uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "employee_temporary_breaks_expected_return_check"
    CHECK ("expected_return" IS NULL OR "expected_return" >= "break_from")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_temporary_breaks_one_active_uidx"
  ON "employee_temporary_breaks" ("employee_id")
  WHERE "ended_at" IS NULL;

CREATE INDEX IF NOT EXISTS "employee_temporary_breaks_active_idx"
  ON "employee_temporary_breaks" ("ended_at", "break_from");
