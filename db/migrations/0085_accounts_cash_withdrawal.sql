-- 0085 — Accounts module · Section 10: Cash Withdrawal Tracker.
-- A per-cheque withdrawals grid (FY Apr→Mar monthly amounts) + a per-entity
-- annual cap tracker (Max Allowed; Total/Remaining computed live from the grid).
-- Super-admin-only (same gate as the rest of /accounts).

CREATE TABLE IF NOT EXISTS "accounts_cash_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,   -- 2025 = FY 2025-26
  "code" text,                        -- the sheet's S. No.
  "entity" text,                      -- Altus Corp | KAS Kotak | …
  "name_on_cheque" text,
  "cheque_no" text,
  "chq_date" text,
  "amount" numeric(14,2),             -- cheque amount
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_cash_items_fy_sort_idx" ON "accounts_cash_items" ("fy_start_year", "sort_order");

CREATE TABLE IF NOT EXISTS "accounts_cash_months" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "accounts_cash_items"("id") ON DELETE CASCADE,
  "month" integer NOT NULL,           -- 1..12 calendar month
  "amount" numeric(14,2),
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_cash_months_uq" ON "accounts_cash_months" ("item_id", "month");

-- Per-entity annual cap. Total-withdrawn + remaining are derived from the grid.
CREATE TABLE IF NOT EXISTS "accounts_cash_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,
  "code" text,
  "entity" text NOT NULL,
  "max_allowed" numeric(14,2),
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_cash_limits_fy_entity_uq"
  ON "accounts_cash_limits" ("fy_start_year", "entity");

-- Managed dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('cash_entity','Altus Corp',1),('cash_entity','MJV Kotak 6063',2),('cash_entity','CMV 1292 Kotak',3),
  ('cash_entity','KAS Kotak',4),('cash_entity','Unleashed Kotak',5),('cash_entity','MJV HUF Kotak',6),
  ('cash_entity','JSV HUF Kotak',7),('cash_entity','Dharav Kotak',8),('cash_entity','CMV 1545 Kotak',9),
  ('cash_entity','Ketan Bavkar Kotak',10),('cash_entity','Smita Raut',11),('cash_entity','MJV HDFC',12),
  ('cash_entity','JSV HUF ICICI',13),
  ('cash_payee','Self',1),('cash_payee','Parvez Khan',2),('cash_payee','Rajashekhar',3),('cash_payee','Pramod',4)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
