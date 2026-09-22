-- ===========================================================================
--  RUN IN SUPABASE — branch Shreya
--  Altus WMS | generated 2026-09-20
-- ===========================================================================
--
--  WHAT THIS FILE IS
--  The single file to paste into the Supabase SQL editor for the Shreya branch
--  work, in the same shape as db/RUN-IN-SUPABASE-0215-0224-ALL.sql. One file,
--  idempotent, safe to run more than once.
--
--      psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-shreya.sql
--
--  CHECK THE PROJECT REF IN THE URL BAR BEFORE YOU RUN ANYTHING. There are
--  three Supabase projects in this team's notes and two of them are not the one
--  you want. The database this branch is developed against is the ref in
--  .env → DATABASE_URL:  ifcdpjbdinvmtewmgceg
--
-- ---------------------------------------------------------------------------
--  THE SHORT ANSWER: THIS BRANCH NEEDS NO SCHEMA CHANGE.
-- ---------------------------------------------------------------------------
--
--  Every feature on branch Shreya was built on columns that already exist. That
--  was a design constraint, not luck — the largest change, "add a company from
--  Admin › Billing Profiles", could have been a new table with a display name
--  on it. It is instead a row in `billing_entity_profiles` whose `entity_id` is
--  not one of the five in lib/hr/entities.ts:
--
--      entity_id  'meridian-holdings-llp'    <- a slug of the typed name
--      legal_name 'Meridian Holdings LLP'    <- the name, and its display name
--
--  `entity_id` is free text with a unique index and no foreign key, so a
--  company added on that screen needs nothing new. The cost is that a custom
--  company has no display name separate from its legal name. That is the trade
--  this file exists to record: a column was available and was not taken.
--
--  So there is nothing below to apply. What IS below is a VERIFY block — run it
--  and it tells you whether this database can serve the new code. It writes
--  nothing.
--
-- ---------------------------------------------------------------------------
--  VERIFY — every object the Shreya branch reads. Expect 11 rows, all OK.
-- ---------------------------------------------------------------------------

SELECT
  needed.table_name || '.' || needed.column_name AS object,
  CASE
    WHEN c.column_name IS NULL THEN '*** MISSING ***'
    ELSE 'OK'
  END AS status
FROM (
  VALUES
    -- Admin › Billing Profiles: the five in code plus companies added there.
    ('billing_entity_profiles', 'entity_id'),
    ('billing_entity_profiles', 'legal_name'),
    ('billing_entity_profiles', 'logo_url'),
    -- Deleting a company refuses when either of these points at it.
    ('billing_documents',       'entity_id'),
    ('billing_contracts',       'entity_id'),
    -- Deleted alongside the company when nothing points at it.
    ('billing_series_defaults', 'entity_id'),
    ('billing_number_series',   'entity_id'),
    -- Numbered notes on a document print from this one text column.
    ('billing_documents',       'remarks'),
    -- Product vs Service decides the document's description column heading.
    ('billing_document_lines',  'product_id'),
    -- Customer Master lands on the client just onboarded, by code.
    ('billing_customers',       'client_code'),
    -- Customer Address Book, one row per address.
    ('billing_customer_addresses', 'kind')
) AS needed(table_name, column_name)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name   = needed.table_name
 AND c.column_name  = needed.column_name
ORDER BY status DESC, object;

-- ---------------------------------------------------------------------------
--  SEPARATELY — DRIFT THAT IS NOT THIS BRANCH'S.  DO NOT "FIX" IT HERE.
-- ---------------------------------------------------------------------------
--
--  Auditing this database on 2026-09-20 (281 tables in db/schema.ts against 311
--  live) turned up TEN tables that exist in the schema and not in the database:
--
--      ai_usage
--      candidate_policy_signatures
--      punch_nonces
--      rev_agent_audit
--      rev_agent_runs
--      rev_campaigns
--      rev_drafts
--      rev_lead_events
--      rev_leads
--      rev_suppression
--
--  None of them belong to this branch and none of them are created here. They
--  are recorded because this project has no drizzle journal table — nothing in
--  the database records which migrations have been applied — so a drift list is
--  the only evidence there is, and an undocumented one gets rediscovered the
--  expensive way. Whoever owns the revenue-agent and candidate-policy work
--  should say whether these are outstanding migrations or tables this database
--  is deliberately without.
--
-- ===========================================================================
--  END
-- ===========================================================================
