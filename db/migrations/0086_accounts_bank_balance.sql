-- 0086 — Accounts module · Section 9: Bank Balance Tracker.
-- Per-entity target balance + dated WEEKLY balance snapshots (columns are
-- dynamic — new weeks are added over the year). "Difference" (latest balance −
-- target) is computed live, NOT stored. Super-admin-only.

-- The accounts/entities being tracked, with their target balance.
CREATE TABLE IF NOT EXISTS "accounts_bank_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,   -- 2026 = FY 2026-27
  "code" text,
  "entity" text NOT NULL,
  "target_balance" numeric(16,2),
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_bank_items_fy_sort_idx" ON "accounts_bank_items" ("fy_start_year", "sort_order");

-- The week columns (a snapshot date / label) defined for an FY.
CREATE TABLE IF NOT EXISTS "accounts_bank_weeks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,
  "label" text NOT NULL,              -- "05.04.2026" | "June Wk4"
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_bank_weeks_fy_sort_idx" ON "accounts_bank_weeks" ("fy_start_year", "sort_order");

-- One balance cell: entity × week.
CREATE TABLE IF NOT EXISTS "accounts_bank_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "accounts_bank_items"("id") ON DELETE CASCADE,
  "week_id" uuid NOT NULL REFERENCES "accounts_bank_weeks"("id") ON DELETE CASCADE,
  "balance" numeric(16,2),
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_bank_balances_uq" ON "accounts_bank_balances" ("item_id", "week_id");

-- Managed dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('bank_entity','Altus Corp',1),('bank_entity','MJV Kotak 6063',2),('bank_entity','CMV 1292 Kotak',3),
  ('bank_entity','KAS Kotak',4),('bank_entity','Unleashed Kotak',5),('bank_entity','MJV HUF Kotak',6),
  ('bank_entity','JSV HUF Kotak',7),('bank_entity','Dharav Kotak',8),('bank_entity','Smita Raut',9),
  ('bank_entity','MJV HDFC',10),('bank_entity','JSV HUF ICICI',11),('bank_entity','CMV 1545 Kotak',12),
  ('bank_entity','MJV ICICI 3381',13),('bank_entity','Federal Savings',14),('bank_entity','Federal OD 2422',15)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
