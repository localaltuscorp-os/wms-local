-- 0064 — Incentive MIS (native rebuild of the "Altus Eco System MIS" sheet
-- incentive tabs). Three read-mostly tables, imported via
-- scripts/import-incentives.ts. Idempotent: safe to re-run.
-- See migration-journal-out-of-sync memory.

CREATE TABLE IF NOT EXISTS "incentive_catalog" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"             text NOT NULL UNIQUE,
  "description"      text,
  "amount"           numeric(14,2) NOT NULL DEFAULT '0',
  "sales_eligible"   boolean,
  "interns_eligible" boolean,
  "notes"            text,
  "sort_order"       integer,
  "active"           boolean NOT NULL DEFAULT true,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "incentive_entries" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "src_sr_no"           integer,
  "entry_date"          date,
  "incentive_name"      text NOT NULL,
  "period_month"        date,
  "emp_name"            text NOT NULL,
  "employee_id"         uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "participant_name"    text,
  "prospect_group_name" text,
  "amount"              numeric(14,2) NOT NULL DEFAULT '0',
  "approved"            boolean NOT NULL DEFAULT false,
  "approved_amt"        numeric(14,2) NOT NULL DEFAULT '0',
  "paid"                boolean NOT NULL DEFAULT false,
  "paid_amt"            numeric(14,2) NOT NULL DEFAULT '0',
  "paid_date"           date,
  "note"                text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "incentive_entries_period_idx" ON "incentive_entries" ("period_month");
CREATE INDEX IF NOT EXISTS "incentive_entries_employee_idx" ON "incentive_entries" ("employee_id");

CREATE TABLE IF NOT EXISTS "incentive_projects" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "src_sr_no"           integer,
  "subject"             text,
  "project_name"        text,
  "initiator_name"      text,
  "supervisor_name"     text,
  "supervisor_id"       uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "intern_name"         text,
  "intern_id"           uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "project_details"     text,
  "period_month"        date,
  "approved"            boolean NOT NULL DEFAULT false,
  "emp_amount"          numeric(14,2) NOT NULL DEFAULT '0',
  "intern_amount"       numeric(14,2) NOT NULL DEFAULT '0',
  "emp_approved_amt"    numeric(14,2) NOT NULL DEFAULT '0',
  "intern_approved_amt" numeric(14,2) NOT NULL DEFAULT '0',
  "paid"                boolean NOT NULL DEFAULT false,
  "emp_paid_amt"        numeric(14,2) NOT NULL DEFAULT '0',
  "intern_paid_amt"     numeric(14,2) NOT NULL DEFAULT '0',
  "paid_date"           date,
  "initiator_notes"     text,
  "note"                text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "incentive_projects_period_idx" ON "incentive_projects" ("period_month");
CREATE INDEX IF NOT EXISTS "incentive_projects_supervisor_idx" ON "incentive_projects" ("supervisor_id");
CREATE INDEX IF NOT EXISTS "incentive_projects_intern_idx" ON "incentive_projects" ("intern_id");
