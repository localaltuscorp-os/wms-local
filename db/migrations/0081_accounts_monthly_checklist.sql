-- 0081 — Accounts module · Section 3: Quarter / Month / Annual Checklist.
-- Recurring monthly / quarterly / annual things-to-get-done, tracked per month
-- across a financial year (Apr→Mar). Super-admin-only (same gate as /accounts).

-- The recurring item definitions (the rows of the checklist).
CREATE TABLE IF NOT EXISTS "accounts_monthly_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text,                       -- "M1".."Mn" (the sheet's S. No.)
  "title" text NOT NULL,             -- "Monthly Things to Get Done"
  "responsible_person" text,
  "deadline" text,                   -- day-of-month, e.g. "1st", "16th"
  "type" text,                       -- Compliance | Collection | Finance | Tally | MIS
  "accounts_notes" text,
  "manan_notes" text,
  "file_link" text,
  "frequency" text,                  -- Monthly | Quarterly | Annual
  "due_month" integer,               -- optional 1..12 anchor for Quarterly/Annual highlight
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_monthly_items_sort_idx" ON "accounts_monthly_items" ("sort_order");

-- Per item, per (financial-year-start, calendar-month) completion status.
-- fy_start_year = the April year of the FY (2025 = FY 2025-26). month = 1..12
-- calendar month; its calendar year is fy_start_year for Apr-Dec, else +1.
CREATE TABLE IF NOT EXISTS "accounts_monthly_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "accounts_monthly_items"("id") ON DELETE CASCADE,
  "fy_start_year" integer NOT NULL,
  "month" integer NOT NULL,          -- 1..12 calendar month
  "status" text NOT NULL,            -- Done | Pending | Need Help | Not Applicable
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_monthly_checks_uq"
  ON "accounts_monthly_checks" ("item_id", "fy_start_year", "month");
CREATE INDEX IF NOT EXISTS "accounts_monthly_checks_fy_idx"
  ON "accounts_monthly_checks" ("fy_start_year");

-- Seed the managed dropdown options for this section (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('monthly_type','Compliance',1),('monthly_type','Collection',2),('monthly_type','Finance',3),
  ('monthly_type','Tally',4),('monthly_type','MIS',5),
  ('monthly_frequency','Monthly',1),('monthly_frequency','Quarterly',2),('monthly_frequency','Annual',3),
  ('monthly_responsible','Dhanashree',1),('monthly_responsible','Siddhesh',2),
  ('monthly_deadline','1st',1),('monthly_deadline','4th',2),('monthly_deadline','5th',3),
  ('monthly_deadline','6th',4),('monthly_deadline','9th',5),('monthly_deadline','16th',6)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
