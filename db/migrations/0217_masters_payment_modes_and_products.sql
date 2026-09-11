-- 0217 — MASTER DATA: payment modes (IGV → IJV + the new accounts) and the
--        PRODUCT master gaining a real code.
--
-- Both halves are master-data work on tables that ALREADY EXIST. Nothing new is
-- created here: `outstanding_payment_modes` and `outstanding_products` have been
-- the admin-managed rosters behind the Outstanding module since 0055, they are
-- referenced by FK from `outstanding_contracts` and `outstanding_collections`,
-- and the brief asks for these lists to become canonical rather than for a
-- second set of tables to appear beside them.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. IGV → IJV
------------------------------------------------------------------------
-- Migration 0070 renamed "Cash" to "IGV" in BOTH rosters at the founder's
-- request, because the payment mode and the paying entity are the same
-- real-world counterparty. "IJV" is a correction of that spelling, so it is
-- applied to BOTH for the same reason — leaving the entity as "IGV" would put
-- two spellings of one company on adjacent dropdowns.
--
-- A RENAME, NOT AN INSERT-AND-REPOINT. Every historical reference is a uuid FK
-- (`expected_mode_id`, `payment_mode_id`, `entity_id`), so renaming the row
-- carries every past contract and collection with it and no history moves.
-- Inserting a fresh "IJV" row instead would silently strand them under a name
-- the company no longer uses.
--
-- The NOT EXISTS guard mirrors 0070's: if an "IJV" row was already created by
-- hand, renaming into it would violate the unique index on `name`. In that case
-- the rename is skipped and the two rows are left for an admin to merge, which
-- is the safe outcome — no FK is silently repointed.

UPDATE outstanding_payment_modes
   SET name = 'IJV', updated_at = now()
 WHERE name = 'IGV'
   AND NOT EXISTS (SELECT 1 FROM outstanding_payment_modes m WHERE m.name = 'IJV');

UPDATE outstanding_entities
   SET name = 'IJV', updated_at = now()
 WHERE name = 'IGV'
   AND NOT EXISTS (SELECT 1 FROM outstanding_entities e WHERE e.name = 'IJV');

------------------------------------------------------------------------
-- 2. The new payment modes
------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING against the unique `name`, so "Pay U" and "Jodo" —
-- which 0055 already seeded — are left exactly as they are rather than being
-- reset to a default sort order or reactivated behind an admin's back.
--
-- `sort_order` defaults to 100 (the roster default): these sort alphabetically
-- beside the existing modes instead of being pinned above them.

INSERT INTO outstanding_payment_modes (name)
VALUES
  ('Razorpay'),
  ('Altus Kotak'),
  ('Unleashed Kotak'),
  ('KAS Kotak'),
  ('MJV HUF Kotak'),
  ('JSV HUF Kotak'),
  ('JSV HUF ICICI'),
  ('CMV G Pay'),
  ('MJV G Pay'),
  ('Pay U'),
  ('Jodo'),
  ('Parvez Kotak'),
  ('Dattaram Kotak'),
  ('Smita'),
  ('Sunil Kotak')
ON CONFLICT (name) DO NOTHING;

------------------------------------------------------------------------
-- 3. Products gain a CODE
------------------------------------------------------------------------
-- The brief: "Products must contain BOTH Product Code and Product Name. Do not
-- use product name alone as the identifier."
--
-- The identifier was ALREADY neither — it is `id uuid`, and every reference in
-- the schema is that uuid. What was missing is the code as a first-class,
-- separately stored and separately displayed attribute, which is what this adds.
--
-- NULLABLE, and no NOT NULL is added later. A product created before this
-- migration and never edited has no code, and inventing one for it in SQL would
-- put a guessed identifier into a master an accountant reads. The backfill below
-- sets a code only where the product's own name IS a code (an all-caps token
-- like BSS or PSO); everything else is left NULL for an admin to fill in, and
-- the UI shows those as "—".

ALTER TABLE outstanding_products
  ADD COLUMN IF NOT EXISTS code text;

-- Case-insensitive uniqueness, and only over rows that HAVE a code, so any
-- number of un-coded products coexist. A partial unique index is the only way to
-- express that: a plain UNIQUE would be satisfied by many NULLs but would also
-- allow 'bss' to sit beside 'BSS'.
CREATE UNIQUE INDEX IF NOT EXISTS outstanding_products_code_lower_idx
  ON outstanding_products (lower(code))
  WHERE code IS NOT NULL;

-- Backfill: the name IS the code where the name is a short all-caps token.
-- Matches BSS, PS, PSO, BSSO, OS, GP; does not match "Altus Conclave",
-- "Commission", "Rent", "Billing", "Retainer", "Consulting".
UPDATE outstanding_products
   SET code = name, updated_at = now()
 WHERE code IS NULL
   AND name ~ '^[A-Z][A-Z0-9]{1,7}$';

------------------------------------------------------------------------
-- 4. The products the brief lists
------------------------------------------------------------------------
-- Inserted by NAME with ON CONFLICT DO NOTHING, exactly like the payment modes:
-- BSS, PS, Commission, Rent, Billing and Retainer were seeded by 0055 and must
-- keep their existing ids, because `outstanding_contracts.product_id` points at
-- them.
--
-- "GP — Graduate Programs" is the one entry the brief itself writes as
-- code-then-name, so it is stored that way: code 'GP', name 'Graduate Programs'.
-- The others are stored under the name the brief uses, and take a code only when
-- that name is already a code. The multi-word ones — Altus Conclave, Commission,
-- Rent, Billing, Retainer — deliberately arrive with NO code rather than a code
-- this migration invented; an admin sets those on /admin/products, where the
-- value is entered by the person who actually knows it.

INSERT INTO outstanding_products (name, code)
VALUES
  ('BSS',               'BSS'),
  ('PS',                'PS'),
  ('Altus Conclave',    NULL),
  ('PSO',               'PSO'),
  ('BSSO',              'BSSO'),
  ('OS',                'OS'),
  ('Commission',        NULL),
  ('Rent',              NULL),
  ('Billing',           NULL),
  ('Retainer',          NULL),
  ('Graduate Programs', 'GP')
ON CONFLICT (name) DO NOTHING;

-- A product seeded by 0055 that the brief does not list ("Consulting") is left
-- ACTIVE and untouched. It is referenced by existing contracts, and the brief's
-- own rule is that a master row which history references is retired with
-- is_active = false by an admin, never deleted by a migration.

------------------------------------------------------------------------
-- 5. The forms Product-Name dropdown keeps its options
------------------------------------------------------------------------
-- `product_options` is a SEPARATE list: the MCQ behind the `product` form-field
-- type (reimbursements, module intake forms). Its options answer "which product
-- was this enquiry about" and include values that are not products on the
-- revenue master at all — "Don't Know", "Key Note", "Being Arjun".
--
-- lib/forms/server.ts used to fall back to a HARDCODED array
-- (DEFAULT_PRODUCT_OPTIONS) whenever this table was empty, which is exactly the
-- hardcoded dropdown the brief objects to. That constant is being deleted, and
-- the field now reads the PRODUCT MASTER merged with the rows below — so this
-- seed exists to make sure the non-product options survive the constant's
-- removal and no form loses a choice it offers today.
--
-- Historical submissions are unaffected either way: `module_submissions` stores
-- the chosen LABEL as text inside its jsonb payload, so a past answer reads back
-- identically whether or not the option is still offered to new submissions.

INSERT INTO product_options (label, sort_order)
VALUES
  ('Don''t Know',   10),
  ('Collaboration', 110),
  ('Key Note',      110),
  ('Inhouse PSO',   110),
  ('Being Arjun',   110),
  ('2 Days',        110),
  ('Consulting',    110)
ON CONFLICT (label) DO NOTHING;
