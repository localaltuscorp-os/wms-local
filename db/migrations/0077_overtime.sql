-- 0077_overtime — Overtime module ("Parvez overtime + dashboard in WMS").
-- Any employee logs their own extra hours for a work day; admins and the
-- employee's manager (org-chart downline) can log on their behalf and
-- approve/reject. Hours kept as numeric(5,2) so quarter/half-hours are exact.
-- Status flows pending → approved | rejected.
-- Idempotent + additive: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "overtime_entries" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id"    uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "work_date"      date NOT NULL,
  "hours"          numeric(5,2) NOT NULL,
  "reason"         text,
  "status"         text NOT NULL DEFAULT 'pending',
  "approved_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "approved_at"    timestamptz,
  "note"           text,
  "created_by_id"  uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "overtime_entries_employee_date_idx"
  ON "overtime_entries" ("employee_id", "work_date");
CREATE INDEX IF NOT EXISTS "overtime_entries_status_idx"
  ON "overtime_entries" ("status");
