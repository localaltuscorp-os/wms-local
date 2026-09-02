-- 0087 — Accounts module · Sections 11 (Vasa Family Interpersonal Balance),
-- 13 (Shares Excel Register), 15 (Last 3-5yr Income Tax Master Folder).
-- All three are flat registers (no monthly grid). The source sheet has no data
-- for them yet (the Vasa tab is empty; Shares/IT have no tab), so they ship as
-- ready-to-fill scaffolds. Super-admin-only.

-- Section 11 — interpersonal reconciliation balances between family entities.
CREATE TABLE IF NOT EXISTS "accounts_vasa_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "party" text,                       -- the entity holding the position
  "direction" text,                   -- Owes | Receives
  "counterparty" text,
  "amount" numeric(16,2),
  "as_on" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_vasa_sort_idx" ON "accounts_vasa_balances" ("sort_order");

-- Section 13 — register of shareholdings / share transactions.
CREATE TABLE IF NOT EXISTS "accounts_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text,
  "entity" text,
  "company" text NOT NULL,
  "folio_demat" text,
  "qty" numeric(18,4),
  "rate" numeric(16,4),
  "value" numeric(18,2),
  "txn_date" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_shares_sort_idx" ON "accounts_shares" ("sort_order");

-- Section 15 — master folder of income-tax records (last 3-5 years), per entity.
CREATE TABLE IF NOT EXISTS "accounts_it_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity" text NOT NULL,
  "fy" text,
  "folder_link" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_it_folders_sort_idx" ON "accounts_it_folders" ("sort_order");

-- Managed dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('vasa_party','MJV HUF',1),('vasa_party','JSV HUF',2),('vasa_party','CMV',3),('vasa_party','IJV',4),
  ('vasa_party','MJV',5),('vasa_party','JSV',6),('vasa_party','KAS',7),('vasa_party','Dharav',8),
  ('shares_entity','Altus Corp',1),('shares_entity','MJV HUF',2),('shares_entity','JSV HUF',3),('shares_entity','Unleashed',4),
  ('it_entity','Altus Corp',1),('it_entity','MJV HUF',2),('it_entity','JSV HUF',3),('it_entity','CMV',4),('it_entity','IJV',5)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
