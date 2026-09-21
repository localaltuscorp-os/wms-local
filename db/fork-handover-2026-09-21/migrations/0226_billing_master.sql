-- ════════════════════════════════════════════════════════════════════════════
-- BILLING MASTER (0226) — the legal-entity record that Billing bills from.
--
-- ── WHY THIS EXTENDS `paying_entities` AND CREATES NO ENTITY TABLE ─────────
-- The brief: "Do NOT create duplicate entity/billing data structures if an
-- existing suitable structure can be extended." There is one, and it is this
-- table. `paying_entities` already holds the five legal entities Altus operates
-- through (Altus Corp, Unleashed, The Gainmakers, Legacy Creators, The Perfect
-- Blend), is already the master behind the salary module and the employee-code
-- allocator, and is already what `lib/hr/entities.ts` reconciles its letterhead
-- registry to.
--
-- Its NAME says "paying" because payroll was the first module to need it, but
-- what it has always stored is the legal entity. A `billing_entities` table
-- would be a second row per company, free to drift from this one, and then two
-- answers to "what is Unleashed's GST number" — which is exactly the
-- duplication the brief rules out. So the billing facts land here.
--
-- Nothing is renamed. `paying_entities` is referenced by `employees`,
-- `salary_profiles` and the code allocator; a rename buys a clearer noun at the
-- cost of touching modules this brief says not to touch.
--
-- ── THERE IS DELIBERATELY NO ENTITY CODE ──────────────────────────────────
-- "Remove Entity Code completely. Do not create or retain an Entity Code
-- field." No such column is added, and the Billing Master UI has no such field
-- or column.
--
-- `code_prefix` (added by 0225) is NOT an entity code and is left alone: it is
-- the single LETTER an EMPLOYEE code starts with (A/U/K/M/J), owned by the
-- employee-code allocator, and dropping it would break employee numbering —
-- an unrelated module. It is not read, shown or written by Billing Master.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §2 Basic ──────────────────────────────────────────────────────────────
-- `name` already exists and is already UNIQUE, which is the duplicate-entity
-- guard the brief asks for (§10); the server action additionally rejects
-- case-insensitive near-duplicates so the constraint never surfaces raw.
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS proprietor_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS proprietor_designation text;

-- ── §2 Contact ────────────────────────────────────────────────────────────
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS cell_no text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS website text;

-- ── §2 Tax / Billing ──────────────────────────────────────────────────────
-- Stored UPPERCASE and unspaced by the action: a GSTIN is case-insensitive on
-- paper but is compared as text here, and "27aaaaa0000a1z5" must not read as a
-- different entity's number from "27AAAAA0000A1Z5".
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS pan_no text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS gst_no text;

-- SAC codes are MULTIPLE (§2: "must support multiple values"). A text[] rather
-- than a child table: they are six-digit codes with no attributes of their own,
-- nothing references an individual one, and ordering is presentational. A join
-- table would add a migration, a query and a join for a list of strings.
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS sac_codes text[] NOT NULL DEFAULT '{}';

-- ── §2 Banking ────────────────────────────────────────────────────────────
-- Named to match the fields the application already uses for bank details
-- (lib/dossier/onboarding-schema.ts: Account Name / Account No / IFSC /
-- Branch), so the two read alike. No extra banking fields are invented.
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS ifsc text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS branch text;

-- ── Who last touched the billing record ───────────────────────────────────
-- `updated_at` already exists on this table. `updated_by_id` did not, and
-- without it the audit trail in settings_events is the only record of who
-- changed a GST number — useful, but not visible on the entity itself.
ALTER TABLE paying_entities
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- §2 Files / Documents — the logo, the signature, and billing documents.
--
-- Shaped on `employee_documents` (0125), the established per-record file table:
-- one ROW per file, the BYTES in the Supabase `documents` bucket addressed by
-- `storage_path`. The brief's rule — "Do not store large files directly in the
-- database if the existing application has a proper file/object-storage
-- mechanism" — is the same rule that table already follows, and
-- lib/storage/objects.ts is the mechanism.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS billing_entity_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE, because §5 permits deleting an entity that invoices already
  -- reference. When the entity goes, its file rows must not outlive it as
  -- orphans pointing at objects nothing will ever clean up. The delete action
  -- removes the stored objects in the same breath.
  entity_id uuid NOT NULL REFERENCES paying_entities(id) ON DELETE CASCADE,

  -- 'logo' | 'signature' | 'document'.
  -- The ROLE lives on the file rather than as `logo_file_id` columns on the
  -- entity: "Replace" is then an ordinary write to this table instead of a
  -- two-table dance that can half-fail and leave an entity pointing at a
  -- deleted object.
  kind text NOT NULL,

  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,

  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The three roles, enforced by the database and not only by the parser.
ALTER TABLE billing_entity_files DROP CONSTRAINT IF EXISTS billing_entity_files_kind_chk;
ALTER TABLE billing_entity_files
  ADD CONSTRAINT billing_entity_files_kind_chk
  CHECK (kind IN ('logo', 'signature', 'document'));

-- ONE logo and ONE signature per entity; documents are unlimited (§2:
-- "Support multiple billing documents/files").
--
-- A partial unique index rather than application logic, because "replace the
-- logo" is a delete-then-insert and two concurrent uploads would otherwise both
-- succeed — leaving an invoice renderer to pick one of two logos arbitrarily.
CREATE UNIQUE INDEX IF NOT EXISTS billing_entity_files_one_per_role_idx
  ON billing_entity_files (entity_id, kind)
  WHERE kind IN ('logo', 'signature');

CREATE INDEX IF NOT EXISTS billing_entity_files_entity_idx
  ON billing_entity_files (entity_id, kind, created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- §7 Historical snapshot support.
--
-- ── WHAT IS AND IS NOT BEING BUILT HERE ───────────────────────────────────
-- The brief says to "inspect the existing invoice schema and implement this
-- using the application's established data model". There is no invoice schema:
-- /billing is a READ-ONLY dashboard over a Google Sheet (lib/queries/billing.ts)
-- and no invoice is created or persisted anywhere in this application. So there
-- is no invoice row on which to hang a snapshot, and inventing an invoicing
-- module to hold one would be the "unrelated change" the brief forbids.
--
-- What DOES exist is the thing that makes the snapshot possible later, and it
-- has to exist from the first edit or the history is already lost: an immutable
-- record of what each entity looked like at each point in time. Every Billing
-- Master write appends one row here carrying the COMPLETE entity as it stood
-- after the change.
--
-- So: `snapshotBillingEntity()` (lib/billing/entity-snapshot.ts) produces the
-- exact payload an invoice must embed, and this table proves what that payload
-- was on any past date. When invoicing is built, it stores the snapshot on the
-- invoice row and old invoices stop depending on the master entirely.
--
-- APPEND-ONLY. No update, no delete, not even when the entity is deleted —
-- which is why `entity_id` does NOT cascade. An invoice that referenced a
-- since-deleted entity (§5 allows exactly that) is the case where this table is
-- the only surviving record of what was printed on it.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS billing_entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- No FK. A deleted entity's versions must survive it (see above), and an FK
  -- with ON DELETE SET NULL would throw away the one identifier that ties a
  -- version back to the invoices that used it.
  entity_id uuid NOT NULL,

  -- Denormalised so a version still reads sensibly after the entity is gone.
  entity_name text NOT NULL,

  -- The complete snapshot: every field an invoice prints, plus the storage
  -- paths of the logo and signature as they stood. jsonb, like every other
  -- point-in-time payload in this schema (settings_events.to_value,
  -- employee_events, holiday audit rows).
  snapshot jsonb NOT NULL,

  -- 'created' | 'updated' | 'files_changed' | 'deleted'
  reason text NOT NULL,

  actor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The query this table exists to answer: "what did entity X look like on date
-- D" → the newest row at or before D.
CREATE INDEX IF NOT EXISTS billing_entity_versions_entity_created_idx
  ON billing_entity_versions (entity_id, created_at DESC);
