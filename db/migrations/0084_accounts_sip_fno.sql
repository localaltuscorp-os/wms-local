-- 0084 — Accounts module · Section 6 (SIP Tracker) + Section 8 (FNO Income).
-- Both are FY (Apr→Mar) monthly-amount grids: a per-row master + a per-row,
-- per-month numeric value, with a client-computed YTD. Super-admin-only.

-- ── SIP Tracker ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "accounts_sip_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,   -- 2025 = FY 2025-26
  "code" text,                        -- the sheet's S. No.
  "entity" text,                      -- MJV HUF | JSV HUF | …
  "fund_name" text NOT NULL,          -- "Bajaj Flexicap fund"
  "location" text,
  "sip_date" text,                    -- day-of-month, e.g. "1st"
  "type" text,                        -- SIP | Loan
  "amount" numeric(14,2),             -- per-installment SIP amount
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_sip_items_fy_sort_idx" ON "accounts_sip_items" ("fy_start_year", "sort_order");

CREATE TABLE IF NOT EXISTS "accounts_sip_months" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "accounts_sip_items"("id") ON DELETE CASCADE,
  "month" integer NOT NULL,           -- 1..12 calendar month
  "amount" numeric(14,2),
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_sip_months_uq" ON "accounts_sip_months" ("item_id", "month");

-- ── FNO Income ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "accounts_fno_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,
  "code" text,
  "entity" text,                      -- JSV HUF | MJV HUF | …
  "agency" text NOT NULL,             -- "Thincred Blu"
  "capital" numeric(16,2),            -- deployed capital (drives the % return)
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_fno_items_fy_sort_idx" ON "accounts_fno_items" ("fy_start_year", "sort_order");

CREATE TABLE IF NOT EXISTS "accounts_fno_months" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "accounts_fno_items"("id") ON DELETE CASCADE,
  "month" integer NOT NULL,           -- 1..12 calendar month
  "amount" numeric(14,2),             -- Rs income that month (% derived = amount/capital)
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_fno_months_uq" ON "accounts_fno_months" ("item_id", "month");

-- Managed dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('sip_entity','MJV HUF',1),('sip_entity','JSV HUF',2),('sip_entity','Altus Corp',3),
  ('sip_type','SIP',1),('sip_type','Loan',2),
  ('fno_entity','JSV HUF',1),('fno_entity','MJV HUF',2),
  ('fno_agency','Thincred Blu',1),('fno_agency','Dhananeeti',2),('fno_agency','Jinit Bheda',3),
  ('fno_agency','Vikabh',4),('fno_agency','Vivek',5),('fno_agency','Finideas',6)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
