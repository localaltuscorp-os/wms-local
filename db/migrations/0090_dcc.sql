-- 0090 — Employees DCC (Daily Compliance Checklist / KPI) module.
-- Per-person KPI definitions + daily fills + manager reviews. The app is the
-- source of truth (imported once from the "Daily Compliance" Google Sheet).

-- Per-person KPI definition (managers/super-admins author; employees fill).
CREATE TABLE IF NOT EXISTS "dcc_kpi_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "section" text,                       -- "Weekly KPI" | "Lawrence & Mayo" | …
  "code" text,                          -- "A1".."B8"
  "title" text NOT NULL,
  "frequency" text,                     -- "Daily" | "Wed & Sat" | "Every Sat" | …
  "weekdays" smallint,                  -- bitmask, bit0=Mon..bit6=Sun (NULL = any)
  "target_number" numeric(14,2),        -- for quantitative KPIs
  "unit" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dcc_kpi_items_owner_idx" ON "dcc_kpi_items" ("owner_employee_id", "sort_order");

-- One fill per item per day.
CREATE TABLE IF NOT EXISTS "dcc_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "dcc_kpi_items"("id") ON DELETE CASCADE,
  "entry_date" date NOT NULL,
  "status" text,                        -- Done | Not done | NA | Pending
  "value_number" numeric(14,2),         -- actual (vs target_number)
  "note" text,
  "filled_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "dcc_entries_uq" ON "dcc_entries" ("item_id", "entry_date");
CREATE INDEX IF NOT EXISTS "dcc_entries_date_idx" ON "dcc_entries" ("entry_date");

-- Manager sign-off for a person's day.
CREATE TABLE IF NOT EXISTS "dcc_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "review_date" date NOT NULL,
  "reviewer_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "status" text,                        -- approved | needs_rework
  "note" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "dcc_reviews_uq" ON "dcc_reviews" ("owner_employee_id", "review_date");
