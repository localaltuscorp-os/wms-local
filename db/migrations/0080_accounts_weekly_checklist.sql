-- 0080 — Accounts module · Section 2: Weekly Checklist.
-- Recurring weekly compliance items (W1..Wn) + per-month, per-week completion
-- status (Wk1..Wk5). Admin/Manager-only (same gate as the rest of /accounts).

-- The recurring item definitions (the rows of the checklist).
CREATE TABLE IF NOT EXISTS "accounts_weekly_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text,                       -- "W1".."W30" (the sheet's S. No.)
  "title" text NOT NULL,
  "deadline" text,                   -- Daily | Mon | Tue | Wed | Thu | Fri | Sat
  "category" text,                   -- Compliance | Collection | Finance | Tally | MIS
  "responsible_person" text,
  "accounts_notes" text,
  "manan_notes" text,
  "file_link" text,
  "frequency" text,                  -- Daily | Weekly
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_weekly_items_sort_idx" ON "accounts_weekly_items" ("sort_order");

-- Per item, per (year, month), per week-of-month completion status.
CREATE TABLE IF NOT EXISTS "accounts_weekly_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "accounts_weekly_items"("id") ON DELETE CASCADE,
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,   -- 1..12
  "week_no" integer NOT NULL,        -- 1..5
  "status" text NOT NULL,            -- Done | Pending | Need Help | Not Applicable
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_weekly_checks_uq"
  ON "accounts_weekly_checks" ("item_id", "period_year", "period_month", "week_no");
CREATE INDEX IF NOT EXISTS "accounts_weekly_checks_period_idx"
  ON "accounts_weekly_checks" ("period_year", "period_month");

-- Seed the managed dropdown options for this section (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('weekly_deadline','Daily',1),('weekly_deadline','Mon',2),('weekly_deadline','Tue',3),
  ('weekly_deadline','Wed',4),('weekly_deadline','Thu',5),('weekly_deadline','Fri',6),
  ('weekly_deadline','Sat',7),
  ('weekly_category','Compliance',1),('weekly_category','Collection',2),('weekly_category','Finance',3),
  ('weekly_category','Tally',4),('weekly_category','MIS',5),
  ('weekly_frequency','Daily',1),('weekly_frequency','Weekly',2),
  ('weekly_responsible','Dhanashree',1),('weekly_responsible','Siddhesh',2)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
