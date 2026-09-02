-- 0082 — Accounts module · Section 5: Due Dates Checklist.
-- A flat register of recurring bills / statutory items grouped by Area, with
-- their frequency, statement period, due date, ECS info and payment-tracking
-- fields. Super-admin-only (same gate as the rest of /accounts).

CREATE TABLE IF NOT EXISTS "accounts_due_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text,                       -- the sheet's S. No.
  "area" text,                       -- Gas | Electricity | Broadband | Cell Phones | Rent | …
  "compliance" text NOT NULL,        -- the particular bill / item
  "frequency" text,                  -- Monthly | Quarterly | Annually
  "ecs" text,                        -- Yes | No | Not Applicable | Don't Know
  "ecs_from" text,
  "statement_period" text,
  "statement_date" text,
  "due_date" text,
  "soft_copy_auto_email" text,
  "hard_copy" text,
  "soft_copy" text,
  "tally_entry" text,                -- Done | Pending | NA
  "balance_tally" text,              -- Tallied | Pending | NA
  "paid_date" text,
  "paid_amt" text,
  "int_fin_chgs" text,
  "chg_reversed" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_due_items_sort_idx" ON "accounts_due_items" ("sort_order");
CREATE INDEX IF NOT EXISTS "accounts_due_items_area_idx" ON "accounts_due_items" ("area");

-- Managed dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('due_area','Gas',1),('due_area','Electricity',2),('due_area','Broadband',3),
  ('due_area','Cell Phones',4),('due_area','Rent',5),('due_area','Maintenance',6),
  ('due_area','Property Tax',7),('due_area','Life Insurance',8),
  ('due_frequency','Monthly',1),('due_frequency','Quarterly',2),('due_frequency','Annually',3)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
