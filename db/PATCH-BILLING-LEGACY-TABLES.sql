-- ============================================================================
-- RUN THIS BEFORE SUPABASE-STEP-2-migrations.sql
-- ============================================================================
--
-- THE ERROR THIS FIXES
--
--   ERROR: 42703: column "outstanding_entity_id" of relation
--   "billing_customers" does not exist
--   LINE 387: INSERT INTO billing_customers (name, outstanding_entity_id)
--
-- WHY IT HAPPENS
--
-- This database already carries a billing_customers table and a
-- billing_sac_codes table from an earlier billing attempt, in an older shape.
-- Every CREATE statement in the bundle is written CREATE TABLE IF NOT EXISTS,
-- which is what makes the bundle safe to re-run -- but on a table that is
-- already there it does nothing at all, old shape and all. The bundle then
-- reaches a statement naming a column that the newer definition has and the
-- older table does not, and stops.
--
-- Nothing was applied: the SQL editor runs a script as one transaction, so the
-- failure rolled the whole thing back. Run this file, let it finish, then run
-- SUPABASE-STEP-2-migrations.sql again from the top.
--
-- WHAT THIS DOES
--
--   1. Adds the ten columns billing_customers is missing and the one column
--      billing_sac_codes is missing. Every add is guarded, so running this
--      twice changes nothing the second time.
--   2. Copies the two rows already in billing_customers onto the new columns:
--      the old kind_attn becomes contact_name, contact_no becomes phone,
--      address becomes address_line1, state becomes state_name. The old
--      columns are LEFT ALONE -- nothing is dropped and nothing is lost, and
--      the application simply does not read them.
--   3. Prints what it did, so the result is visible rather than assumed.
--
-- WHAT THIS DOES NOT DO
--
-- It does not drop the five leftover columns (kind_attn, address, state,
-- contact_person, contact_no). They are all nullable, so they cost nothing but
-- a little clutter, and dropping columns that hold live values is not a thing
-- to do in the same breath as a migration. Once the Billing screens have been
-- used for a while and the values above are confirmed to have carried over,
-- they can go in their own small change.
-- ============================================================================


-- ── 1. billing_sac_codes ──────────────────────────────────────────────────
-- The default GST rate the invoice line picks up when a SAC code is chosen.
ALTER TABLE billing_sac_codes
  ADD COLUMN IF NOT EXISTS default_gst_rate numeric(5,2);


-- ── 2. billing_customers ──────────────────────────────────────────────────
-- Ten columns, in the order the newer definition declares them.
ALTER TABLE billing_customers
  ADD COLUMN IF NOT EXISTS legal_name    text,
  -- "Kind Attn." on the printed document.
  ADD COLUMN IF NOT EXISTS contact_name  text,
  -- E.164, +919876543210
  ADD COLUMN IF NOT EXISTS whatsapp      text,
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  -- state_code already exists and drives intra- vs inter-state GST; this is
  -- the readable name printed beside it.
  ADD COLUMN IF NOT EXISTS state_name    text,
  ADD COLUMN IF NOT EXISTS country       text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS outstanding_entity_id uuid REFERENCES outstanding_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;


-- ── 3. Carry the rows already there onto the new columns ──────────────────
-- COALESCE on the left so this is safe to re-run: a value already written by
-- the Billing screens is never overwritten by the older copy of itself.
UPDATE billing_customers
SET contact_name  = COALESCE(contact_name,  NULLIF(btrim(kind_attn), ''), NULLIF(btrim(contact_person), '')),
    phone         = COALESCE(phone,         NULLIF(btrim(contact_no), '')),
    address_line1 = COALESCE(address_line1, NULLIF(btrim(address), '')),
    state_name    = COALESCE(state_name,    NULLIF(btrim(state), ''))
WHERE kind_attn IS NOT NULL
   OR contact_person IS NOT NULL
   OR contact_no IS NOT NULL
   OR address IS NOT NULL
   OR state IS NOT NULL;


-- ── 4. What it looks like now ─────────────────────────────────────────────
SELECT
  count(*)                                                           AS customers,
  count(*) FILTER (WHERE contact_name  IS NOT NULL)                  AS with_contact_name,
  count(*) FILTER (WHERE phone         IS NOT NULL)                  AS with_phone,
  count(*) FILTER (WHERE address_line1 IS NOT NULL)                  AS with_address_line1,
  count(*) FILTER (WHERE country = 'India')                          AS country_defaulted
FROM billing_customers;

-- Every column the bundle is about to use. Each row should read PRESENT.
SELECT needed.column_name AS column_needed,
       CASE WHEN c.column_name IS NULL THEN 'STILL MISSING' ELSE 'PRESENT' END AS status
FROM (VALUES
    ('legal_name'), ('contact_name'), ('whatsapp'), ('phone'),
    ('address_line1'), ('address_line2'), ('state_name'), ('country'),
    ('outstanding_entity_id'), ('updated_by_id')
) AS needed(column_name)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name   = 'billing_customers'
 AND c.column_name  = needed.column_name
ORDER BY status DESC, column_needed;
