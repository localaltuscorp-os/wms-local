-- 0083 — Accounts module · Section 4/12: Credit Cards Master.
-- A per-card master (FY-scoped) + a per-card, per-month tracking record across a
-- financial year (Apr→Mar). One FY-aware section serves both the 25-26 and the
-- 26-27 sheet tabs. Super-admin-only (same gate as the rest of /accounts).

-- The card definitions (FY-scoped — a card's ECS / statement window can differ
-- year to year, so each FY has its own master rows).
CREATE TABLE IF NOT EXISTS "accounts_cc_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy_start_year" integer NOT NULL,   -- 2025 = FY 2025-26
  "code" text,                        -- the sheet's S. No.
  "entity_name" text,                 -- Altus Corp | Unleashed | …
  "card_name" text NOT NULL,          -- "Amex 33001"
  "ecs" text,                         -- Yes | No | Don't Know
  "ecs_from" text,
  "stmt_period" text,                 -- "15th - 14th"
  "stmt_start_day" text,              -- "St Dt"
  "due_day" text,                     -- "Due Dt"
  "soft_copy_auto_email" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_cc_cards_fy_sort_idx" ON "accounts_cc_cards" ("fy_start_year", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_cc_cards_fy_code_uq"
  ON "accounts_cc_cards" ("fy_start_year", "code") WHERE "code" IS NOT NULL;

-- Per card, per calendar month: the 9 tracked fields.
CREATE TABLE IF NOT EXISTS "accounts_cc_months" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "card_id" uuid NOT NULL REFERENCES "accounts_cc_cards"("id") ON DELETE CASCADE,
  "month" integer NOT NULL,           -- 1..12 calendar month
  "hard_copy" text,                   -- Yes | No | NA
  "google_drive" text,                -- Yes | No | NA
  "tally_entry" text,                 -- Done | Pending | NA
  "balance_tally" text,               -- Tallied | Pending | NA
  "cc_paid_date" text,
  "cc_paid_amt" text,
  "int_fin_chgs" text,
  "chg_reversed" text,                -- Yes | No | NA
  "notes" text,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_cc_months_uq" ON "accounts_cc_months" ("card_id", "month");

-- Managed dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('cc_entity','Altus Corp',1),('cc_entity','Unleashed',2)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
