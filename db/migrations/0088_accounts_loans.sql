-- 0088 — Accounts module · SIP Tracker → Loans sub-tables (the deferred blocks
-- of the "SIP/Loans Checklist"). Per-loan monthly EMI + loan-account closing
-- balance, over a dynamic set of month columns (the source spans FY24-25 +
-- recent months, so columns are label-based, not a fixed FY). FY-independent —
-- shown as panels under the SIP fund grid. Super-admin-only.

CREATE TABLE IF NOT EXISTS "accounts_loan_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text,
  "entity" text,
  "loan_name" text NOT NULL,
  "location" text,
  "emi_date" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_loan_items_sort_idx" ON "accounts_loan_items" ("sort_order");

-- The month columns (shared by both the EMI and closing-balance grids).
CREATE TABLE IF NOT EXISTS "accounts_loan_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "label" text NOT NULL,              -- "Apr-24" | "Jun-26"
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_loan_periods_sort_idx" ON "accounts_loan_periods" ("sort_order");

-- One cell per loan × period: the EMI paid + the loan-account closing balance.
CREATE TABLE IF NOT EXISTS "accounts_loan_cells" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "loan_id" uuid NOT NULL REFERENCES "accounts_loan_items"("id") ON DELETE CASCADE,
  "period_id" uuid NOT NULL REFERENCES "accounts_loan_periods"("id") ON DELETE CASCADE,
  "emi" numeric(16,2),
  "closing_balance" numeric(18,2),
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_loan_cells_uq" ON "accounts_loan_cells" ("loan_id", "period_id");

INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('loan_entity','Altus Corp',1),('loan_entity','MJV HUF',2),('loan_entity','JSV HUF',3)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
