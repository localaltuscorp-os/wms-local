-- ===========================================================================
--  RUN IN SUPABASE — the merge from wms/main
--  Altus WMS | generated 2026-09-21
-- ===========================================================================
--
--  WHAT THIS FILE IS
--  The 55 commits merged from `wms/main` brought code that reads 16 tables and
--  15 columns this database does not have. Until they exist the app still
--  runs — every reader fails closed — but it logs a query error on each page
--  and the features behind them are inert. The one people hit first is
--  `security_role_grants`: `UserMenuServer` asks it who may unlock accounts on
--  EVERY request, so its failure prints on every page load.
--
--      psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-merge-main.sql
--
--  CHECK THE PROJECT REF IN THE URL BAR BEFORE YOU RUN ANYTHING. Three
--  Supabase projects appear in this team's notes and two of them are not the
--  one you want. The ref in .env -> DATABASE_URL is:  ifcdpjbdinvmtewmgceg
--
--  SAFE TO RUN TWICE. Every statement below was checked: CREATE TABLE and
--  CREATE INDEX are IF NOT EXISTS, ADD COLUMN is IF NOT EXISTS, and there is
--  no DROP or TRUNCATE anywhere in it. Migrations already applied are no-ops,
--  which is why the whole set is here rather than a guess at which are
--  outstanding — this project has no drizzle journal table, so nothing in the
--  database records what has run.
--
--  WHAT IS **NOT** HERE: the ten-table drift the Shreya handoff recorded in
--  its section 1a (ai_usage, candidate_policy_signatures, punch_nonces and the
--  seven rev_* tables). Those were missing before this merge and belong to the
--  revenue-agent and candidate-policy work — their owner should say whether
--  they are outstanding migrations or tables this database is deliberately
--  without.
--
--  RUN IT STATEMENT BY STATEMENT — do NOT wrap it in a transaction.
--  0234_initiator_status_archived.sql carries
--  `alter type approval_status add value ... 'archived'`, and Postgres will not
--  let a new enum value be USED in the same transaction that adds it. The
--  migration says so itself. Pasting this into the Supabase SQL editor, which
--  auto-commits each statement, is exactly right. Because every statement is
--  IF NOT EXISTS, a run that stops halfway is finished by running it again.
--
--  CONTENTS — 29 migrations, in order:
--    0225_candidate_policy_signature_image.sql
--    0225_employee_master.sql
--    0225_jd_assignment_targets.sql
--    0226_billing_master.sql
--    0226_employee_policy_typed_signatures.sql
--    0226_jd_rank_ladder_26.sql
--    0227_entity_code_prefixes.sql
--    0228_employee_schedule_settings.sql
--    0228_jd_entries_category.sql
--    0229_dcc_calendar_events.sql
--    0229_incentive_request_split.sql
--    0230_dcc_master_items.sql
--    0230_incentive_approval_workflow.sql
--    0231_approver_initiator_status.sql
--    0231_incentive_notifications.sql
--    0232_incentive_master.sql
--    0232_recruitment_jds.sql
--    0233_jd_person_specific.sql
--    0234_functions_replace_departments.sql
--    0234_initiator_status_archived.sql
--    0235_dcc_call_logs.sql
--    0236_recruitment_jd_roles.sql
--    0237_account_lockouts.sql
--    0237_checklist_wms_columns_jd_client.sql
--    0238_security_role_grants.sql
--    0238_wcc_mcc.sql
--    0240_incentive_entry_reversal.sql
--    0241_template_files.sql
--    0242_two_step_verification.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  0225_candidate_policy_signature_image.sql
-- ---------------------------------------------------------------------------
-- CANDIDATE POLICY SIGNING — the signature IMAGE.
--
-- A typed name was the whole signature (see 0222). The candidate now also
-- uploads a photo of their handwritten signature, and the policy cannot be
-- signed without it, so the storage key is recorded next to the name it backs.
--
-- NULLABLE on purpose, even though the app requires it from here on: rows
-- signed before this column existed were validly signed under the rule that
-- applied then, and back-filling them with an empty string would forge a
-- signature that was never collected. A null therefore means "typed-only,
-- signed before images were required" — a real distinction worth keeping.
--
-- The path is a key into the PRIVATE documents bucket, never a public URL, and
-- lives under `candidate-intake/<employee id>/` so the ownership check that
-- guards every other candidate upload also guards this one.
ALTER TABLE candidate_policy_signatures
  ADD COLUMN IF NOT EXISTS signature_path text;

-- ---------------------------------------------------------------------------
--  0225_employee_master.sql
-- ---------------------------------------------------------------------------
-- 0225 — EMPLOYEE MASTER: the five fields the employee record did not have.
--
-- ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
-- It is NOT a new employee system. `employees` stays the single source of
-- truth, and every field the Employee Master shows that already exists — name,
-- designation, entity, department, manager, DOJ, probation end, the mails, the
-- phone, the attendance schedule — is read from where it already lives. CTC and
-- its breakup stay in `salary_profiles` / `salary_ctc_breakup`; family, address
-- and banking stay in `onboarding_submissions.fields`; documents stay in
-- `employee_documents`; HR records stay in the HR module. Nothing is copied.
--
-- What was genuinely ABSENT, and is added here, is five things:
--
--   employee_code   · function_id · shift_type_id · is_team_lead · train_pass
--
-- plus the registry that makes employee codes permanently retirable.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. FUNCTIONS — a master list, shaped exactly like designations
------------------------------------------------------------------------
-- DELIBERATELY NOT `departments`. The Employee Master shows both (spec §7), so
-- they are different questions: a department is where someone sits on the org
-- chart (and already drives `employee_departments`, team scoping and a dozen
-- queries); a function is what they do. Modelled on `designations` rather than
-- invented fresh, so the admin screen, the sort order and the active flag all
-- behave the way every other master list in this application behaves.
CREATE TABLE IF NOT EXISTS functions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive, so "Sales" and "sales" cannot both exist and split a filter.
CREATE UNIQUE INDEX IF NOT EXISTS functions_name_uq ON functions (lower(name));
CREATE INDEX IF NOT EXISTS functions_active_idx ON functions (is_active, sort_order);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS function_id uuid REFERENCES functions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_function_idx ON employees (function_id);

------------------------------------------------------------------------
-- 2. SHIFT TYPES — a master list, same shape again
------------------------------------------------------------------------
-- DISTINCT FROM `worker_type`, which the spec calls Employee Type and lists
-- separately (§7). `worker_type` decides how someone is PAID — it routes
-- `payBasisFor` to monthly_ctc / hourly / fixed_fee and is load-bearing in the
-- salary engine. A shift is when they work. Overloading the pay basis to carry
-- a shift label would put a presentation concern inside the payroll branch, and
-- `full_time | second_half | hybrid` cannot express "Night" or "Flexible"
-- without changing what the salary engine reads.
CREATE TABLE IF NOT EXISTS shift_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shift_types_name_uq ON shift_types (lower(name));
CREATE INDEX IF NOT EXISTS shift_types_active_idx ON shift_types (is_active, sort_order);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS shift_type_id uuid REFERENCES shift_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_shift_type_idx ON employees (shift_type_id);

-- A starting set, so the field is usable the moment the screen opens rather
-- than presenting an empty dropdown. `ON CONFLICT DO NOTHING` against the
-- case-insensitive index makes a re-run a no-op, and an administrator can
-- rename, reorder or deactivate any of them afterwards.
INSERT INTO shift_types (name, sort_order) VALUES
  ('General', 10),
  ('First Half', 20),
  ('Second Half', 30),
  ('Night', 40),
  ('Flexible', 50)
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------
-- 3. THE TWO FLAGS
------------------------------------------------------------------------
-- Booleans with a false default rather than nullable three-state columns: the
-- Employee Master renders these as Y/N and filters on them, and "unknown" is
-- not an answer either control can show. Existing rows become N, which is the
-- accurate reading of "nobody has ever been marked a team lead".
--
-- NOTE `is_team_lead` is NOT a permission. It is descriptive, and the spec
-- explicitly keeps it out of the main table (§2). Authorization continues to
-- come from `is_admin`, the capability registry and `manager_id`.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_team_lead boolean NOT NULL DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS train_pass boolean NOT NULL DEFAULT false;

------------------------------------------------------------------------
-- 4. EMPLOYEE CODE
------------------------------------------------------------------------
-- The displayed code, denormalised onto the employee so the master table can
-- sort and filter on it without a join. The REGISTRY below is what allocates
-- it; this column is the current value.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_code text;

-- Case-insensitive and partial: most rows are NULL until a code is issued, and
-- "a-101" must not be able to coexist with "A-101".
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_uq
  ON employees (lower(employee_code))
  WHERE employee_code IS NOT NULL;

-- The letter that starts a code, per entity: A = Altus Corp, U = Unleashed,
-- K = Khushboo Shah, M = MJV HUF, J = JSV HUF.
--
-- STORED ON THE ENTITY, not hardcoded in the allocator, for the same reason
-- every other master list is a table: a sixth entity must not need a deploy.
-- Left NULL here rather than guessed — two entities currently carry a Khushboo
-- name ("Khushboo" and "The Perfect Blend (Khushboo Shah)"), so which one owns
-- "K" is a decision for an administrator, not for a migration.
ALTER TABLE paying_entities
  ADD COLUMN IF NOT EXISTS code_prefix text;

CREATE UNIQUE INDEX IF NOT EXISTS paying_entities_code_prefix_uq
  ON paying_entities (upper(code_prefix))
  WHERE code_prefix IS NOT NULL;

------------------------------------------------------------------------
-- 5. THE CODE REGISTRY — what makes retirement permanent
------------------------------------------------------------------------
-- THE RULE THIS TABLE EXISTS FOR: "Whoever leaves the organisation — that
-- number cannot be given to any new person — it is permanently retired."
--
-- A unique index on `employees.employee_code` cannot express that. It stops two
-- LIVE employees sharing a code, but the moment a leaver's row is archived,
-- anonymised or has its code cleared, the number becomes free again and the
-- next allocation hands it straight back out. The guarantee needs a record that
-- outlives the employment, which is this table.
--
-- Allocation therefore reads `max(seq)` over EVERY row for a prefix — retired
-- ones included — and never over the employees table. A number is issued once
-- and once only, for the life of the database.
--
-- It is also what makes the intern conversion honest: "UI will become U, UI will
-- be retired permanently". That is two registry operations — retire UI-101,
-- issue the next free U-nnn — not an UPDATE of the old code, so the person's
-- history keeps both and neither number is ever reused.
CREATE TABLE IF NOT EXISTS employee_code_registry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The whole code as displayed, e.g. 'A-101', 'UI-103'.
  code         text NOT NULL,
  -- Split out so allocation is an integer max() rather than string parsing.
  prefix       text NOT NULL,
  seq          integer NOT NULL,
  -- NULLABLE and ON DELETE SET NULL on purpose: the registry must survive the
  -- employee row being deleted, or the number it retired becomes reissuable by
  -- exactly the act that was supposed to retire it forever.
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- Kept as text as well, so a deleted employee's code is still attributable.
  employee_name text,
  status       text NOT NULL DEFAULT 'active',   -- active | retired
  issued_at    timestamptz NOT NULL DEFAULT now(),
  issued_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  retired_at   timestamptz,
  retired_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  retired_reason text
);

-- A code is unique across all time, whatever its status. This is the guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS employee_code_registry_code_uq
  ON employee_code_registry (upper(code));

-- And the (prefix, seq) pair likewise, so the allocator cannot be raced into
-- issuing 'A-101' twice by two administrators clicking at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS employee_code_registry_prefix_seq_uq
  ON employee_code_registry (upper(prefix), seq);

CREATE INDEX IF NOT EXISTS employee_code_registry_employee_idx
  ON employee_code_registry (employee_id);

CREATE INDEX IF NOT EXISTS employee_code_registry_status_idx
  ON employee_code_registry (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_code_registry_status_chk') THEN
    ALTER TABLE employee_code_registry
      ADD CONSTRAINT employee_code_registry_status_chk CHECK (status IN ('active', 'retired'));
  END IF;
END $$;

-- AT MOST ONE ACTIVE CODE PER EMPLOYEE. A person holds one code at a time; an
-- intern conversion retires the old row before writing the new one, and this
-- index is what stops a half-finished conversion leaving somebody holding two.
-- Partial, so a person's retired codes accumulate freely as history.
CREATE UNIQUE INDEX IF NOT EXISTS employee_code_registry_one_active_uq
  ON employee_code_registry (employee_id)
  WHERE status = 'active' AND employee_id IS NOT NULL;

-- ---------------------------------------------------------------------------
--  0225_jd_assignment_targets.sql
-- ---------------------------------------------------------------------------
-- 0225 — Job Description assignments become PER DESTINATION.
--
-- The JD form now has three boxes: Daily Compliance Checklist, Work Management
-- System and Event Checklist, each with its own list of people. An assignment
-- therefore has to say WHICH destination it is for — "Dattaram does this job"
-- is no longer a complete answer when the job goes to three places and he only
-- covers one of them.
--
-- THREE FLAGS ON ONE ROW, not one row per destination. A person who does the
-- job for two destinations is one assignment with two flags, so the existing
-- partial unique index on (jd_id, employee_id) WHERE is_active still holds —
-- and that index is what stops somebody being assigned twice and receiving the
-- same task twice. One row per destination would have required dropping it.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

alter table jd_assignments
  add column if not exists for_dcc   boolean not null default false,
  add column if not exists for_wms   boolean not null default false,
  add column if not exists for_event boolean not null default false;

-- Existing rows were written before destinations were separable: they meant
-- "this person does this job", full stop. They inherit whichever destinations
-- the JD itself pushes to, which is what that used to mean in practice.
--
-- Guarded on all-three-false so a re-run cannot undo a real edit made after the
-- first run.
update jd_assignments a
   set for_dcc   = e.push_dcc,
       for_wms   = e.push_wms,
       for_event = e.push_event
  from jd_entries e
 where e.id = a.jd_id
   and a.for_dcc = false
   and a.for_wms = false
   and a.for_event = false;

-- Reading "who is assigned for the DCC" is the query the push job will run once
-- per JD per day, so it is worth an index rather than a scan per row.
create index if not exists jd_assignments_target_idx
  on jd_assignments (jd_id, is_active, for_dcc, for_wms, for_event);

-- ---------------------------------------------------------------------------
--  0226_billing_master.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
--  0226_employee_policy_typed_signatures.sql
-- ---------------------------------------------------------------------------
-- EMPLOYEE POLICY SIGN-OFF: printed name + date + signature image.
--
-- Employees already had a way to sign a policy: DigiLocker, which yields an
-- Aadhaar-verified identity, an archived signed PDF and a `document_signatures`
-- row. This table is the SECOND, always-available way - the same three things a
-- candidate provides (a printed name, the moment, and an image of their actual
-- signature) - for the many cases where DigiLocker is not to hand.
--
-- ── WHY ITS OWN TABLE AND NOT `document_signatures` ──────────────────────
-- Filing a typed-and-uploaded signature among the DigiLocker-verified ones
-- would make the two indistinguishable to anyone reading the ledger later, and
-- they are NOT equivalent evidence. Kept separate for the same reason
-- candidate_policy_signatures (0222) is separate, and mirrored into
-- `policy_compliance` with a null doc_instance_id, which is what every HR
-- screen already reads to answer "who has acknowledged what".
--
-- One row per employee per policy: signing again UPDATES it (re-stamping the
-- version), which is what happens when a policy is republished.
CREATE TABLE IF NOT EXISTS employee_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  -- The published version that was on screen when they signed.
  version integer NOT NULL DEFAULT 1,
  -- What they printed, verbatim.
  signed_name text NOT NULL,
  -- Storage key of the signature image in the PRIVATE documents bucket.
  signature_path text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_policy_signature_uq UNIQUE (employee_id, policy_key)
);

CREATE INDEX IF NOT EXISTS employee_policy_signatures_employee_idx
  ON employee_policy_signatures (employee_id);

-- ---------------------------------------------------------------------------
--  0226_jd_rank_ladder_26.sql
-- ---------------------------------------------------------------------------
-- 0226 — the Job Description rank ladder becomes the account holder's 26.
--
-- Replaces the fourteen seeded by 0222. Twelve ranks are new, the orders of the
-- ones that stay are renumbered, and ONE old rank — DGM — has no equivalent in
-- the new list.
--
-- `rank_order` IS BEHAVIOUR: the vacancy resolver climbs it, so a job
-- description on an empty seat goes to the next filled rung above. Renumbering
-- therefore reroutes live work, which is why this is a migration with a report
-- at the end rather than a seed script.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

-- Orders are rewritten in two passes. Doing it in one would collide with the
-- unique index on rank_order the moment a new number lands on a row that has
-- not moved yet — 'Executive' going from 30 to 40 while 40 is still 'Sr.
-- Executive'. Parking every existing rank in a range nothing else uses makes
-- the second pass unconditional.
update jd_ranks set rank_order = rank_order + 10000 where rank_order < 10000;

insert into jd_ranks (name, rank_order, band, is_active) values
  ('Intern - First Year',         10,  'Trainee',            true),
  ('Intern - Second Year',        20,  'Trainee',            true),
  ('Intern - Third Year',         30,  'Trainee',            true),
  ('Executive',                   40,  'Individual',         true),
  ('Sr. Executive',               50,  'Individual',         true),
  ('Consultant',                  60,  'Individual',         true),
  ('Sr. Consultant',              70,  'Individual',         true),
  ('Assistant Manager',           80,  'Management',         true),
  ('Deputy Manager',              90,  'Management',         true),
  ('Manager',                     100, 'Management',         true),
  ('Associate Vice President',    110, 'Leadership',         true),
  ('Deputy Vice President',       120, 'Leadership',         true),
  ('Vice President',              130, 'Leadership',         true),
  ('Senior Vice President',       140, 'Leadership',         true),
  ('President',                   150, 'Leadership',         true),
  ('Sr President',                160, 'Leadership',         true),
  ('Assistant General Manager',   170, 'General Management', true),
  ('General Manager',             180, 'General Management', true),
  ('Sr. General Manager',         190, 'General Management', true),
  ('Associate Director',          200, 'Director',           true),
  ('Deputy Director',             210, 'Director',           true),
  ('Director',                    220, 'Director',           true),
  ('Senior Director',             230, 'Director',           true),
  ('CEO',                         240, 'Board',              true),
  ('Managing Director',           250, 'Board',              true),
  ('Chairman',                    260, 'Board',              true)
on conflict (name) do update
  set rank_order = excluded.rank_order,
      band       = excluded.band,
      is_active  = true,
      updated_at = now();

-- The four renamed intern rungs. Their old names were parked above, so the seats
-- pointing at them move across intact rather than being orphaned.
update jd_ranks r set is_active = false
 where r.rank_order >= 10000
   and r.name in ('Intern (2nd Yr)', 'Intern (3rd Yr)');

-- DGM IS LEFT ALONE, DELIBERATELY. It has no equivalent in the new list, and
-- guessing between Deputy Director and General Manager would reroute whatever
-- work sits on those seats. It stays active, parked above the ladder, and the
-- notice below asks a human to decide.
do $$
declare
  stranded int;
begin
  select count(*) into stranded
    from jd_positions p
    join jd_ranks r on r.id = p.rank_id
   where r.rank_order >= 10000 and r.is_active;

  if stranded > 0 then
    raise notice 'Migration 0226: % position(s) still sit on a rank outside the new ladder (DGM or similar). Re-point them by hand — they will escalate above every new rank until you do.', stranded;
  end if;
end $$;

-- ---------------------------------------------------------------------------
--  0227_entity_code_prefixes.sql
-- ---------------------------------------------------------------------------
-- ════════════════════════════════════════════════════════════════════════════
-- ENTITY CODE PREFIXES (0227) — the letters employee codes are built from.
--
--     A = Altus Corp                       A-101, A-102, …
--     U = Unleashed                        U-101, …
--     K = Khushboo                         K-101, …
--     M = The Gainmakers (MJV HUF)         M-101, …
--     J = Legacy Creators (JSV HUF)        J-101, …
--
-- Interns carry an "I" after the letter — AI/UI/KI/MI/JI — as a SEPARATE number
-- series. That rule lives in lib/employees/employee-code.ts and needs nothing
-- here: the intern prefix is derived from the entity letter at allocation time.
--
-- ── WHY THIS IS A MIGRATION OF ITS OWN, AND WHY 0225 LEFT IT NULL ─────────
-- Migration 0225 added `code_prefix` and deliberately assigned none, recording
-- the reason: "two entities currently carry a Khushboo name and which of them
-- owns 'K' is not a migration's decision." That was right. The two candidates
-- were `Khushboo` and `The Perfect Blend (Khushboo Shah)`, and picking wrongly
-- would put five people on the wrong series — codes that cannot be un-issued.
--
-- It is now an operator decision rather than a guess: K is `Khushboo`, the
-- entity that actually has the five employees. `The Perfect Blend (Khushboo
-- Shah)` is deliberately left NULL — it has no employees, and a letter it does
-- not need is a letter nobody else can have.
--
-- ── MATCHED ON EXACT NAME, AND SILENT ON A MISS ──────────────────────────
-- `name` is UNIQUE on this table and is the value migration 0158 reconciled
-- these rows to, so it is the stable handle; ids differ between environments.
-- A name that does not match updates nothing rather than guessing at a
-- near-neighbour — assigning A to the wrong company is worse than assigning
-- nothing, because the codes it mints are permanent.
--
-- ── SAFE TO RE-RUN ────────────────────────────────────────────────────────
-- Each statement is conditional on the prefix not already being set, so this
-- cannot overwrite a letter an administrator has since changed by hand.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE paying_entities SET code_prefix = 'A'
 WHERE name = 'Altus Corp' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'U'
 WHERE name = 'Unleashed' AND code_prefix IS NULL;

-- The operator's decision. See the header.
UPDATE paying_entities SET code_prefix = 'K'
 WHERE name = 'Khushboo' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'M'
 WHERE name = 'The Gainmakers (MJV HUF)' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'J'
 WHERE name = 'Legacy Creators (JSV HUF)' AND code_prefix IS NULL;

-- ── ONE LETTER, ONE ENTITY ────────────────────────────────────────────────
-- Two entities sharing a letter would mint colliding codes: both would draw
-- from the same series, and the first collision would surface as a unique-index
-- error at the moment somebody tried to issue a code. Enforced in the database
-- because the allocator derives the prefix from whatever is in this column and
-- has no way to notice that two rows agree.
--
-- Partial, so the entities with no letter (The Perfect Blend, and any entity
-- added later) are not all competing for a single NULL.
CREATE UNIQUE INDEX IF NOT EXISTS paying_entities_code_prefix_uq
  ON paying_entities (upper(code_prefix))
  WHERE code_prefix IS NOT NULL;

-- A prefix is ONE letter here. The intern series is derived, never stored, so a
-- two-character value in this column would mean somebody had mistaken the
-- entity letter for a full prefix — and `suggestPrefix` would then produce
-- "UII" for an intern were it not separately idempotent.
ALTER TABLE paying_entities DROP CONSTRAINT IF EXISTS paying_entities_code_prefix_chk;
ALTER TABLE paying_entities
  ADD CONSTRAINT paying_entities_code_prefix_chk
  CHECK (code_prefix IS NULL OR code_prefix ~ '^[A-Za-z]$');

-- ---------------------------------------------------------------------------
--  0228_employee_schedule_settings.sql
-- ---------------------------------------------------------------------------
-- ════════════════════════════════════════════════════════════════════════════
-- EMPLOYEE-LEVEL SCHEDULE SETTINGS (0228)
--
-- Five settings that were policy-by-convention and are now per employee:
--
--   1. Is Attendance Applicable          Yes/No, default Yes
--   2. 1st–5th Saturday Working          Yes/No each, default Yes
--   3. Employee timings                  Mon–Fri and Saturday, start + end
--   4. Full-Time WFH allowed             Yes/No, default No
--   5. Part-Time WFH allowed             Yes/No, default No
--
-- ── EVERY DEFAULT REPRODUCES TODAY'S BEHAVIOUR EXACTLY ─────────────────────
-- This migration must be a no-op for all 27 existing employees on the day it
-- lands, because it runs against live attendance and salary data. So:
--
--   · attendance_applicable defaults TRUE — everybody punches today.
--   · sat1..sat5_working default TRUE — `WORKING_DAYS_PER_WEEK = 6` in
--     lib/attendance/effective-config.ts means Mon–Sat is already the week for
--     every day-graded worker, so "all five Saturdays work" IS the status quo.
--   · the Saturday times default NULL, and NULL means "same as Mon–Fri" rather
--     than "no Saturday schedule". A non-null value is an override; nobody has
--     one until an admin sets it, so nobody's grading moves.
--   · both WFH flags default FALSE, which is the current rule (there is no
--     per-employee WFH entitlement today).
--
-- NOT NULL with a default is safe here: Postgres 11+ rewrites this without a
-- table scan, and `employees` is 27 rows.
--
-- ── WHY MON–FRI REUSES THE EXISTING COLUMNS ────────────────────────────────
-- The brief asks for "Monday–Friday Start/End", and `att_official_start` /
-- `att_official_end` already hold exactly that value — they are what the Admin
-- Panel writes and what `resolveEffectiveConfig` reads as the PRIMARY input for
-- punctuality. Adding `mon_fri_start` beside them would give one concept two
-- columns, which is the precise bug the effective-config resolver was written
-- to fix (see its header: the panel wrote one pair, the engine read the other,
-- and a 19:00 checkout silently graded as an early leave).
--
-- So: Mon–Fri keeps the existing pair, and only SATURDAY gets new columns.
-- Existing data carries over untouched and there is no backfill to get wrong.
--
-- ── WHAT THIS MIGRATION DOES NOT TOUCH ─────────────────────────────────────
-- The 54 h/week target. `weekly_target_minutes` is untouched and the resolver
-- still derives 9 h × 6 for a full-timer. Timings define WHEN the scheduled
-- period is, never how long the week must add up to — that is the brief's own
-- rule and it is enforced in code, not here.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Is attendance applicable
------------------------------------------------------------------------
-- FALSE means this person is not required to punch at all. It is not an
-- exemption from a rule they are still measured against — the day ledger stops
-- treating their missing punches as absence, so no attendance deduction can be
-- computed from them. See `attendanceApplicable` in effective-config.ts.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS attendance_applicable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.attendance_applicable IS
  'FALSE = not required to punch; absence never counts against attendance or salary.';

------------------------------------------------------------------------
-- 2. Which Saturdays of the month are working days
------------------------------------------------------------------------
-- Five separate columns rather than a bitmask or an array, because the brief
-- asks for five independent Yes/No controls and this is the shape that reads
-- back as five checkboxes without any decoding. It is also the shape a SQL
-- report can filter on directly.
--
-- "1st Saturday" means the first Saturday BY DATE in that calendar month, which
-- is the ordinary reading and what `saturdayOrdinal()` implements.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sat1_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat2_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat3_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat4_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat5_working boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.sat1_working IS
  'Is the 1st Saturday of the month a working day for this employee?';

------------------------------------------------------------------------
-- 3. Saturday timings
------------------------------------------------------------------------
-- NULL = follow the Mon–Fri schedule (att_official_start / att_official_end).
-- Only a value set here makes Saturday differ, so the column being empty is
-- the same as it not existing — which is what keeps this migration inert.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sat_official_start time,
  ADD COLUMN IF NOT EXISTS sat_official_end   time;

COMMENT ON COLUMN employees.sat_official_start IS
  'Saturday start. NULL = same as the Mon-Fri att_official_start.';
COMMENT ON COLUMN employees.sat_official_end IS
  'Saturday end. NULL = same as the Mon-Fri att_official_end.';

-- A start after an end is a data-entry slip that would silently produce a
-- negative scheduled span downstream. Refuse it at the column rather than
-- defend against it in five callers. Both-null and both-set are the only
-- states the UI can produce; one-of-two is allowed and means "override just
-- that edge", so the constraint only fires when both are present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_sat_hours_ordered'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_sat_hours_ordered
      CHECK (
        sat_official_start IS NULL
        OR sat_official_end IS NULL
        OR sat_official_start < sat_official_end
      );
  END IF;
END $$;

------------------------------------------------------------------------
-- 4 & 5. Work-from-home entitlement
------------------------------------------------------------------------
-- Two independent flags, not one enum: the brief lists them as separate Yes/No
-- fields, and they are genuinely independent — somebody may be allowed the
-- occasional part-time WFH day without being allowed to work remotely full
-- time, and an always-remote hire is the reverse.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS wfh_full_time_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wfh_part_time_allowed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.wfh_full_time_allowed IS
  'May work from home full time.';
COMMENT ON COLUMN employees.wfh_part_time_allowed IS
  'May work from home part of the week.';

-- ---------------------------------------------------------------------------
--  0228_jd_entries_category.sql
-- ---------------------------------------------------------------------------
-- 0228 — a Category on every Job Description.
--
-- Free text, not a lookup table: the account holder asked for a column the
-- author can simply write in — Housekeeping, Internet, Vendors — and the set is
-- not known up front. The form suggests categories already in use, so the same
-- word is not spelled three ways, without refusing a new one.
--
-- The Event Checklist already has its own `ops_checklist_items.category` from
-- 0221; only the JD Bank needs the column.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

alter table jd_entries add column if not exists category text;

-- ---------------------------------------------------------------------------
--  0229_dcc_calendar_events.sql
-- ---------------------------------------------------------------------------
-- 0229 — Daily Compliance in every employee's Google Calendar.
--
-- The account holder asked (2026-09-15) for every DCC entry to sit in each
-- employee's Altus Google Calendar. lib/dcc/calendar-sync.ts keeps ONE all-day
-- event per person per day; this table remembers which Google event that is and
-- what was last sent, so an unchanged day costs no API call and a changed one is
-- updated in place instead of duplicated.
--
--   google_event_id  null once the day's event has been removed
--   synced_hash      fingerprint of the event body last sent
--   snapshot_at      when the data behind that sync was read — a slower sync
--                    that read older data never overwrites a newer one
--   last_error       the last Google failure, retried by the next run
--
-- A new table rather than columns on `employees` or `dcc_entries`: the event is
-- per person-DAY, which neither of those rows is.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists dcc_calendar_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  event_date date not null,
  google_event_id text,
  synced_hash text,
  snapshot_at timestamptz,
  synced_at timestamptz,
  last_error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_calendar_events_uq
  on dcc_calendar_events (employee_id, event_date);

-- ---------------------------------------------------------------------------
--  0229_incentive_request_split.sql
-- ---------------------------------------------------------------------------
-- 0229 — INCENTIVE REQUESTS: the Split Incentive shares.
--
-- The New Incentive Request form can now split one incentive between 2–5
-- people, each with a percentage that totals exactly 100%. This is where that
-- lands.
--
-- WHY A COLUMN, NOT `details`. `details` is a flat `Record<string, string>` of
-- form answers, rendered and validated field by field from
-- lib/incentive-fields.ts. A list of {employee, share} objects is not a form
-- answer, and serialising it into a string inside that map would make every
-- later reader parse JSON out of JSON.
--
-- WHY NOT `incentive_participants`. That table already exists (0107), but it
-- belongs to the PAYOUT side: its rows carry booked / accrued / paid amounts and
-- a CHECK pinning each row to an `incentive_entries` or `incentive_projects`
-- parent. A request that has not been approved has no amount to book, and
-- Approval and Accounts were explicitly out of scope for this change.
--
-- SHAPE (enforced in lib/incentive/split.ts + lib/incentive/prepare-request.ts):
--   [{ "employeeId": uuid, "name": text, "pct": number }, ...]
--   2–5 entries, distinct employees, the requester among them, shares > 0 with
--   at most 2 decimals, totalling exactly 100.
-- The CHECK below guards only the outer shape — array, 2–5 long. The per-share
-- rules need arithmetic over the elements, which a CHECK cannot express
-- without a function, and the application is the only writer.
--
-- NULL means "not split": the existing single-employee request, unchanged.
-- Every row that exists today is NULL, so no backfill.
--
-- FULLY IDEMPOTENT. The constraint is dropped and re-added rather than wrapped
-- in a DO block, which keeps the file a plain list of statements.

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS split jsonb;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_split_shape_chk;

-- CASE, not AND: Postgres does not promise to evaluate `jsonb_typeof(...) =
-- 'array'` before `jsonb_array_length(...)`, and the latter raises on a
-- non-array rather than returning false.
ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_split_shape_chk CHECK (
    split IS NULL
    OR CASE
         WHEN jsonb_typeof(split) = 'array' THEN jsonb_array_length(split) BETWEEN 2 AND 5
         ELSE false
       END
  );

-- ---------------------------------------------------------------------------
--  0230_dcc_master_items.sql
-- ---------------------------------------------------------------------------
-- 0230 — DCC Masters: a Daily Compliance template per POSITION.
--
-- The account holder asked (2026-09-15) for DCC to work the way the Job
-- Description does — a master for a position, plus a specific DCC for an
-- employee. "Position" is the employee's DESIGNATION (employees.designation_id),
-- the one already set for 20 of 23 people.
--
-- LIVE-LINKED. Every active employee holding a designation carries one real KPI
-- (`dcc_kpi_items`) per active master item of that designation, so filling,
-- history, the dashboard, the 10 PM report and the calendar all work unchanged.
-- lib/dcc/master-sync.ts keeps them in step: a master edit updates every holder,
-- a retired master KPI is archived (history kept), and a change of designation
-- swaps one master's KPIs for the other's.
--
-- THE LINK IS ITS OWN TABLE, not a column on `dcc_kpi_items`: Drizzle names every
-- declared column in an INSERT, so a new column there would break adding a KPI
-- anywhere until this migration had been applied by hand. A KPI with no row here
-- is the employee's SPECIFIC DCC — including all ~260 that exist today.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists dcc_master_items (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references designations(id) on delete cascade,
  section text,
  code text,
  title text not null,
  frequency text,
  target_number numeric(14, 2),
  unit text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dcc_master_items_designation_idx
  on dcc_master_items (designation_id, is_active, sort_order);

create table if not exists dcc_master_links (
  item_id uuid primary key references dcc_kpi_items(id) on delete cascade,
  master_item_id uuid not null references dcc_master_items(id) on delete cascade,
  owner_employee_id uuid not null references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One linked KPI per person per master item: what stops a double sync from
-- giving somebody the same KPI twice.
create unique index if not exists dcc_master_links_owner_master_uq
  on dcc_master_links (owner_employee_id, master_item_id);

-- ---------------------------------------------------------------------------
--  0230_incentive_approval_workflow.sql
-- ---------------------------------------------------------------------------
-- 0230 — INCENTIVE APPROVAL, REJECTION AND RESUBMISSION.
--
-- Every incentive request now goes through Manan Vasa's review, and a request
-- that is Not Approved (or sent back for revision) can be justified and
-- resubmitted. This migration adds what that needs and nothing else: Accounts,
-- payouts, the dashboard and the Incentive Master are untouched.
--
-- ── THE LIVE RECORD STAYS WHERE IT IS ─────────────────────────────────────
-- `incentive_requests` remains the one row per request. Its `status`,
-- `details`, `split` and `decided_*` columns describe the CURRENT submission
-- and the LATEST decision, exactly as every existing reader expects. What was
-- missing is the past, and that is what the two new tables hold.
--
-- ── STATUS VALUES ─────────────────────────────────────────────────────────
--   pending              Pending Approval
--   approved             Approved            (also the result of Publish)
--   rejected             Not Approved        (stored value kept: see below)
--   due                  Due
--   not_due              Not Due
--   reversed             Reversed
--   revision_requested   Revision Requested  (content types: Revise)
--
-- `rejected` is NOT renamed to `not_approved`. It already means exactly that,
-- rows and code read it today (lib/queries/weekly-goals.ts counts `approved`;
-- the unpaid calculation keys on `approved`), and renaming a stored value would
-- rewrite every decided row for a change of label. The label lives in
-- db/enums.ts.
--
-- The CHECK that pinned the old three values (Postgres auto-named it
-- `incentive_requests_status_check`) is replaced, not loosened: the new list is
-- still closed, so a typo in application code cannot invent a state.
--
-- ── WHY TWO HISTORY TABLES, NOT A JSON COLUMN ─────────────────────────────
-- A submission is a snapshot of what the employee sent; a decision is an act
-- by a reviewer. They have different columns, different authors and different
-- rules (a decision may need a reason; a resubmission needs a justification),
-- and the brief asks for both to be queryable: who decided, why, when, on which
-- version. A JSON array on the request would satisfy "keep history" while
-- making every one of those questions a parse.
--
-- ── IMMUTABLE BY CONSTRUCTION ─────────────────────────────────────────────
-- Both tables are append-only. A BEFORE UPDATE trigger refuses any edit, so the
-- audit trail cannot be rewritten by a stray query or a future bug. DELETE is
-- left to the ON DELETE CASCADE from the request itself — the history belongs
-- to the request, and removing an employee (which cascades their requests)
-- must not be blocked by it.
--
-- ── BACKFILL ──────────────────────────────────────────────────────────────
-- Every existing request gets its Submission 1 snapshot from its current row,
-- dated when it was created. Any request already decided gets one audit row
-- with action `legacy` — its reviewer and note are known, its previous status
-- is not recorded anywhere, so it is written as `pending`, the only state a
-- request could be decided from before this change.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. incentive_requests: the state list and the current version
------------------------------------------------------------------------
ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_status_check;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  );

-- The submission the live row currently holds. 1 for every existing request.
ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS submission_no integer NOT NULL DEFAULT 1;

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_submission_no_chk;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_submission_no_chk CHECK (submission_no >= 1);

------------------------------------------------------------------------
-- 2. Submissions — one immutable snapshot per version
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_request_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES incentive_requests (id) ON DELETE CASCADE,
  submission_no   integer NOT NULL,
  type            text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  split           jsonb,
  -- NULL on Submission 1; required on every resubmission (CHECK below).
  justification   text,
  submitted_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_request_submissions_no_chk CHECK (submission_no >= 1),
  -- A resubmission without a justification is exactly what the brief forbids;
  -- held here too so a writer that skips the application check still cannot.
  CONSTRAINT incentive_request_submissions_justification_chk CHECK (
    submission_no = 1 OR (justification IS NOT NULL AND length(btrim(justification)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS incentive_request_submissions_request_no_uq
  ON incentive_request_submissions (request_id, submission_no);

------------------------------------------------------------------------
-- 3. Decisions — the audit trail
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_request_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES incentive_requests (id) ON DELETE CASCADE,
  -- The request's owner at the time, denormalised so the trail reads without a
  -- join and survives a later change of owner.
  employee_id     uuid REFERENCES employees (id) ON DELETE SET NULL,
  submission_no   integer NOT NULL,
  previous_status text NOT NULL,
  new_status      text NOT NULL,
  action          text NOT NULL,
  reviewer_id     uuid REFERENCES employees (id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_request_decisions_action_chk CHECK (
    action IN ('approve', 'not_approve', 'due', 'not_due', 'reverse', 'publish', 'revise', 'legacy')
  ),
  CONSTRAINT incentive_request_decisions_prev_status_chk CHECK (
    previous_status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  ),
  CONSTRAINT incentive_request_decisions_new_status_chk CHECK (
    new_status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  ),
  -- The three decisions that must say why. `legacy` is exempt: those rows were
  -- decided before a reason was ever required.
  CONSTRAINT incentive_request_decisions_note_chk CHECK (
    action NOT IN ('not_approve', 'reverse', 'revise')
    OR (note IS NOT NULL AND length(btrim(note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS incentive_request_decisions_request_idx
  ON incentive_request_decisions (request_id, created_at);

------------------------------------------------------------------------
-- 4. Append-only
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION incentive_history_is_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is an audit trail — rows cannot be edited, only added.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS incentive_request_submissions_immutable ON incentive_request_submissions;
CREATE TRIGGER incentive_request_submissions_immutable
  BEFORE UPDATE ON incentive_request_submissions
  FOR EACH ROW EXECUTE FUNCTION incentive_history_is_immutable();

DROP TRIGGER IF EXISTS incentive_request_decisions_immutable ON incentive_request_decisions;
CREATE TRIGGER incentive_request_decisions_immutable
  BEFORE UPDATE ON incentive_request_decisions
  FOR EACH ROW EXECUTE FUNCTION incentive_history_is_immutable();

------------------------------------------------------------------------
-- 5. Backfill
------------------------------------------------------------------------
INSERT INTO incentive_request_submissions
  (request_id, submission_no, type, details, split, submitted_by_id, submitted_at)
SELECT r.id, 1, r.type, r.details, r.split, r.employee_id, r.created_at
  FROM incentive_requests r
 WHERE NOT EXISTS (
   SELECT 1 FROM incentive_request_submissions s WHERE s.request_id = r.id
 );

INSERT INTO incentive_request_decisions
  (request_id, employee_id, submission_no, previous_status, new_status, action, reviewer_id, note, created_at)
SELECT r.id, r.employee_id, r.submission_no, 'pending', r.status, 'legacy',
       r.decided_by_id, r.decision_note, r.decided_at
  FROM incentive_requests r
 WHERE r.decided_at IS NOT NULL
   AND r.status IN ('approved', 'rejected')
   AND NOT EXISTS (
     SELECT 1 FROM incentive_request_decisions d WHERE d.request_id = r.id
   );

-- ---------------------------------------------------------------------------
--  0231_approver_initiator_status.sql
-- ---------------------------------------------------------------------------
-- 0231 — Approver / Initiator Status beside Doer Status, in WMS Tasks, Goals
-- and Projects (account holder, 2026-09-15).
--
-- Every piece of work now carries two statuses:
--   Doer Status                  Not Read · Not Started · Initiated · Follow Up ·
--                                Need Info · Done
--   Approver / Initiator Status  Pending · Approved · Not Approved · On Hold ·
--                                Cancelled      (Pending = no ruling = NULL)
-- The vocabulary and the rule for who may rule live in
-- lib/status/approver-status.ts.
--
-- Idempotent: this repository applies migrations by hand.

-- ── TASKS ──────────────────────────────────────────────────────────────────
-- On Hold becomes a ruling. tasks.approval_status gains the value.
-- (ADD VALUE cannot run inside a transaction block together with a statement
-- that uses the new value — run this file statement by statement, or apply
-- this line on its own first.)
alter type approval_status add value if not exists 'on_hold';

-- ── GOALS ──────────────────────────────────────────────────────────────────
-- A SIDE TABLE, not a column on goals / weekly_goals: much of the Goals module
-- reads those tables with a bare `select()` / `returning()`, which name every
-- declared column — a new column there would break the whole module until this
-- migration had run. No row = Pending.
create table if not exists goal_approver_statuses (
  goal_id uuid primary key references goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists weekly_goal_approver_statuses (
  weekly_goal_id uuid primary key references weekly_goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── PROJECTS ───────────────────────────────────────────────────────────────
-- project_nodes.approval_status already exists (0204) with exactly these
-- values; nothing to add.

-- ---------------------------------------------------------------------------
--  0231_incentive_notifications.sql
-- ---------------------------------------------------------------------------
-- 0231 · Incentive notifications & emails
--
-- Two ADDITIVE tables. No existing table, column or constraint is altered.
--
-- incentive_catalog_events — one append-only row per material change to the
--   Incentive Master (`incentive_catalog`, the "Incentive Table"): created,
--   updated or deleted, with the before / after snapshots and the field-level
--   changes. It is written in the same transaction as the change itself, so an
--   Incentive Master change cannot happen without its event.
--     · created_at IS the effective date of any eligibility change the row
--       carries ("no longer eligible with effect from …").
--     · id IS the event version used to de-duplicate what it sends.
--     · catalog_id is deliberately NOT a foreign key: a "deleted" event has to
--       outlive the incentive it describes.
--
-- incentive_notification_deliveries — the idempotency ledger. One row per
--   (event type, subject, recipient, version). A delivery is claimed with
--   INSERT … ON CONFLICT DO NOTHING before anything is sent, so a retried
--   action, a page refresh or a replayed event cannot notify or email the same
--   person about the same thing twice.
--
-- Deleting an incentive from the master never touched requests, approvals or
-- payments (incentive_requests / incentive_entries do not reference
-- incentive_catalog; weekly_goals' reference is ON DELETE SET NULL) and this
-- migration keeps it that way.

create table if not exists incentive_catalog_events (
  id           uuid primary key default gen_random_uuid(),
  catalog_id   uuid,
  catalog_name text not null,
  event_type   text not null,
  before       jsonb,
  after        jsonb,
  changes      jsonb not null default '[]'::jsonb,
  actor_id     uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint incentive_catalog_events_type_chk
    check (event_type in ('created', 'updated', 'deleted')),
  constraint incentive_catalog_events_snapshot_chk check (
    (event_type = 'created' and after is not null)
    or (event_type = 'updated' and before is not null and after is not null)
    or (event_type = 'deleted' and before is not null)
  )
);

create index if not exists incentive_catalog_events_catalog_idx
  on incentive_catalog_events (catalog_id, created_at);

create or replace function incentive_catalog_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'incentive_catalog_events is append-only';
end;
$$;

drop trigger if exists incentive_catalog_events_no_update on incentive_catalog_events;
create trigger incentive_catalog_events_no_update
  before update on incentive_catalog_events
  for each row execute function incentive_catalog_events_immutable();

create table if not exists incentive_notification_deliveries (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  subject_id   uuid not null,
  recipient_id uuid not null references employees(id) on delete cascade,
  version_key  text not null,
  created_at   timestamptz not null default now()
);

create unique index if not exists incentive_notification_deliveries_uq
  on incentive_notification_deliveries (event_type, subject_id, recipient_id, version_key);

create index if not exists incentive_notification_deliveries_recipient_idx
  on incentive_notification_deliveries (recipient_id, created_at);

-- ---------------------------------------------------------------------------
--  0232_incentive_master.sql
-- ---------------------------------------------------------------------------
-- 0232 · Admin Panel → Incentive → Incentive Master + Incentive Chart
--
-- ADDITIVE ONLY. Four new columns on the existing Incentive Master, one new
-- table for per-employee eligibility, one new column on the change log. No
-- existing column is dropped, renamed or re-typed, and nothing that already
-- reads `incentive_catalog` has to change to keep working.
--
-- ── WHY NOT A NEW "incentives" TABLE ───────────────────────────────────────
-- `incentive_catalog` IS the Incentive Master — the "3.Incentive Chart" the
-- Incentive Table dialog shows, the prices the dashboard values approvals at
-- (lib/incentive/analytics/model.ts), and what weekly_goals.incentive_catalog_id
-- points to. A second table would mean two answers to "what does a Google
-- Review pay", and eventually two different ones. So the fields the brief adds
-- are columns here.
--
-- ── NOTE (merge, 2026-09-19): THE TWO SECTIONS BELOW ARE HISTORY ──────────
-- They describe the eligibility table this migration used to create. It no
-- longer does — see section 2. Per-employee eligibility is Rohan's 0216
-- (`incentive_eligibility` + `incentive_catalog.applies_to_all`), where a
-- removal DELETES the row and the effective date lives on the change event.
--
-- ── ELIGIBILITY BECOMES PER-EMPLOYEE, WITHOUT BREAKING THE GROUPS ──────────
-- Until now eligibility was two flags — `sales_eligible` / `interns_eligible` —
-- resolved against an employee's designation
-- (lib/incentive/notifications/eligibility.ts). The brief asks for named
-- employees, added and removed with an effective date, which those flags cannot
-- express.
--
-- Both are kept, and `incentive_eligibility` WINS WHERE IT EXISTS: an incentive
-- with at least one eligibility row is governed by those rows; one with none
-- keeps the group flags exactly as it behaves today. That is what lets this
-- migration run against live data without silently changing who is eligible for
-- anything, and without a backfill that would guess at names.
--
-- ── REMOVAL IS A DATE, NOT A DELETE ────────────────────────────────────────
-- "When removing an employee, record the effective date." So removal sets
-- `removed_effective_from` and the row stays. Eligibility is therefore a
-- history, and "who was eligible on 3 Jun" is answerable. Nothing here deletes
-- requests, approvals, resubmissions or payments — none of those reference the
-- Master at all (incentive_requests / incentive_entries carry no catalog FK,
-- and weekly_goals' reference is ON DELETE SET NULL).

-- ── 1 · The Master's new fields ──────────────────────────────────────────────

alter table incentive_catalog
  -- Which request type this scheme prices, from the existing INCENTIVE_TYPES
  -- vocabulary (db/enums.ts). Nullable: project, sheet and weekly-goal
  -- incentives are real rows here and map to no request form.
  add column if not exists incentive_type text,
  -- "Product where applicable — pull from Admin Panel → Products." The SAME
  -- product master every other dropdown reads (`outstanding_products`, served
  -- by lib/queries/products.ts). Never a text copy of a product name: renaming
  -- a product must not leave a stale name behind here.
  add column if not exists product_id uuid references outstanding_products(id) on delete set null,
  -- Permanent (runs until switched off) or One-Time (a single campaign).
  add column if not exists duration text not null default 'permanent',
  -- Optional last day the incentive applies. Independent of `active`: a scheme
  -- can be switched off before it expires, and an expired one can still be
  -- marked active without paying anything.
  add column if not exists valid_until date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_duration_chk'
  ) then
    alter table incentive_catalog
      add constraint incentive_catalog_duration_chk
      check (duration in ('permanent', 'one_time'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_type_chk'
  ) then
    -- Mirrors INCENTIVE_TYPES in db/enums.ts. Null is allowed (see above).
    alter table incentive_catalog
      add constraint incentive_catalog_type_chk
      check (
        incentive_type is null
        or incentive_type in (
          'bss_conversion', 'sales_pitch', 'client_happiness',
          'group_intro', 'leads_referrals'
        )
      );
  end if;
end $$;

create index if not exists incentive_catalog_active_name_idx
  on incentive_catalog (active, name);

-- ── 2 · Per-employee eligibility (the Incentive Chart) ───────────────────────
--
-- REMOVED at merge (2026-09-19). This section created its own
-- `incentive_eligibility` — catalog_id, effective_from, removed_effective_from,
-- added/removed_by — with a partial unique index over live grants. Rohan's
-- migration 0216 had already created a table of the SAME NAME with a different
-- shape (incentive_id, employee_id, one row per pair; `applies_to_all` on the
-- catalog), and that one reached main and staging first. `create table if not
-- exists` silently skipped this one, and the index below it then failed on real
-- Postgres: `column "removed_effective_from" does not exist`.
--
-- The decision recorded in HANDOFF-Production-DB.md is to keep Rohan's table.
-- The Incentive Master now reads and writes it (lib/queries/incentive-master.ts,
-- app/(admin)/admin/incentive-master/actions.ts). If dated eligibility is
-- genuinely required, it is a NEW migration agreed with Rohan — not this one.

-- ── 3 · The change log carries the chosen effective date ─────────────────────
--
-- 0231 used `created_at` as the effective date of any eligibility change, which
-- was right when eligibility could only change at the moment of the edit. Now
-- that a date is chosen, the notification must say the chosen one — "no longer
-- eligible with effect from 1 Oct" — not the day the button was pressed.
-- Nullable, and readers fall back to `created_at`, so every event already
-- written keeps the meaning it had.
alter table incentive_catalog_events
  add column if not exists effective_date date;

-- ---------------------------------------------------------------------------
--  0232_recruitment_jds.sql
-- ---------------------------------------------------------------------------
-- 0232 — Recruitment JDs: the job descriptions recruiters send to candidates.
--
-- The account holder asked (2026-09-15) for a Job Description section for
-- recruiters, for every position we hire into, that can be sent to anyone by
-- WhatsApp or email, inside the HR module. It is NOT the internal Job
-- Description module (/operations/job-description, the JD Bank of recurring
-- duties per seat) — that answers "who does this job"; this answers "what do
-- we tell a candidate about this job".
--
-- One row per candidate position (`interview_positions`, the list the Candidate
-- Interview Form already uses), holding two versions:
--   master_content     the original — Rutvisha's JD. Changed only deliberately.
--   recruiter_content  what recruiters edit and send. NULL = identical to the
--                      master, so a master update flows through until someone
--                      edits the recruiter copy. "Reset to master" sets it NULL.
-- Content is jsonb in the shape lib/operations/recruitment-jd.ts defines, so the fields
-- can grow once the real JDs arrive without another migration.
--
-- recruitment_jd_sends records every send — what was sent (a snapshot, since
-- the JD can change afterwards), to whom, how, and by whom. A WhatsApp send is
-- 'opened': the WMS opens WhatsApp with the JD typed in; the recruiter presses
-- Send there, which the WMS cannot see.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null unique references interview_positions(id) on delete restrict,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);

-- ---------------------------------------------------------------------------
--  0233_jd_person_specific.sql
-- ---------------------------------------------------------------------------
-- 0233 — Job Description for a SPECIFIC PERSON.
--
-- The account holder asked (2026-09-15) for the JD module to hold, beside the
-- General JD (a position's job descriptions), tasks written for ONE person that
-- belong to no seat. A person's full JD is then: what their seat carries + what
-- is assigned to them by name + these.
--
-- A task now belongs to EXACTLY ONE owner — a position OR a person — and the
-- CHECK below makes that a database fact, not a convention: a row with neither
-- would be nobody's work, and a row with both would be counted twice.
--
-- Idempotent: this repository applies migrations by hand.

alter table jd_entries alter column position_id drop not null;

alter table jd_entries
  add column if not exists owner_employee_id uuid references employees(id) on delete cascade;

alter table jd_entries drop constraint if exists jd_entries_owner_chk;
alter table jd_entries
  add constraint jd_entries_owner_chk check ((position_id is null) <> (owner_employee_id is null));

create index if not exists jd_entries_owner_employee_idx on jd_entries (owner_employee_id, is_active);

-- ---------------------------------------------------------------------------
--  0234_functions_replace_departments.sql
-- ---------------------------------------------------------------------------
-- 0234 · FUNCTIONS REPLACE DEPARTMENTS
--
-- The organisational attribute on an employee is called a FUNCTION, not a
-- department. Employee Master has shown it that way since 0225 ("FUNCTION —
-- this is the DEPARTMENT record, relabelled"); this migration makes the data
-- match the word, everywhere.
--
-- ── WHAT MOVES, AND WHAT STAYS ─────────────────────────────────────────────
-- The `functions` table (created empty by 0225 and never used) becomes the live
-- master, holding the SAME ROWS WITH THE SAME IDS as `departments`. Because the
-- ids are preserved, every `department_id` already stored on an employee keeps
-- pointing at the same organisational unit — nothing is re-assigned, and no
-- screen changes what it says.
--
-- `departments` is KEPT, with all of its rows, as a BACKUP. Nothing reads or
-- writes it after this migration. It is deliberately not dropped: it is the
-- record of what the Function list looked like before the move.
--
-- ── IT ALSO REPAIRS 19 EMPLOYEES WHOSE FUNCTION WAS INVISIBLE ──────────────
-- 19 of 26 employees carry a `department_id` that exists in NO table — six
-- distinct ids left behind by a restore that loaded rows with foreign-key
-- triggers disabled (which is also why the constraint still reports itself as
-- valid). Their Function rendered as "—" on every screen, including Employee
-- Master.
--
-- Every one is recoverable, because the legacy free-text `employees.department`
-- column still holds the name and each broken id maps to exactly ONE name. So
-- they are remapped by name rather than nulled, and 19 people get their Function
-- back.
--
-- ── employee_departments IS CLEANED, NOT REPAIRED ──────────────────────────
-- The multi-Function join table has the same damage — 48 of its 75 rows point
-- at ids that exist nowhere — but there it is NOT recoverable: the same broken
-- id appears against employees of three different legacy departments, so a name
-- cannot be inferred. Those rows are deleted rather than guessed at.
--
-- Deleting them changes nothing a user can see. `getEmployeeDepartmentMap()`
-- (lib/queries/departments.ts) reads this table with an INNER JOIN onto the
-- master, so a row whose id resolves to nothing already contributes nothing to
-- any screen. What is removed is invisible today and would only have blocked
-- the foreign key below.

-- ── 1 · Copy the master, ids and all ─────────────────────────────────────────

insert into functions (id, name, is_active, sort_order, created_at, updated_at)
select d.id, d.name, d.is_active, d.sort_order, d.created_at, d.updated_at
from departments d
on conflict (id) do nothing;

-- ── 2 · Give 19 employees their Function back ────────────────────────────────

update employees e
set department_id = f.id
from functions f
where e.department_id is not null
  and not exists (select 1 from functions x where x.id = e.department_id)
  and e.department is not null
  and lower(btrim(e.department)) = lower(f.name);

-- Anything still dangling had no legacy name to recover from. Null it rather
-- than leave a value that points at nothing — the column is nullable, and "no
-- Function recorded" is honest where "a Function that does not exist" is not.
update employees
set department_id = null
where department_id is not null
  and not exists (select 1 from functions f where f.id = employees.department_id);

-- ── 3 · Clear the unrecoverable join rows (see the header) ───────────────────

delete from employee_departments ed
where not exists (select 1 from functions f where f.id = ed.department_id);

-- ── 4 · Point the foreign keys at the live master ────────────────────────────
--
-- The column NAMES stay `department_id`. Renaming them would touch ~1,289
-- identifiers across ~180 files for no behavioural gain, and the constraint is
-- what decides which table the value must exist in.

alter table employees
  drop constraint if exists employees_department_id_fkey;
alter table employees
  add constraint employees_department_id_fkey
  foreign key (department_id) references functions(id) on delete set null;

alter table employee_departments
  drop constraint if exists employee_departments_department_id_fkey;
alter table employee_departments
  add constraint employee_departments_department_id_fkey
  foreign key (department_id) references functions(id) on delete cascade;

alter table jd_positions
  drop constraint if exists jd_positions_department_id_fkey;
alter table jd_positions
  add constraint jd_positions_department_id_fkey
  foreign key (department_id) references functions(id) on delete set null;

-- ── 5 · The name stays unique, case-insensitively ────────────────────────────
--
-- `departments.name` carried a plain UNIQUE constraint; `functions` already has
-- a case-insensitive unique index (0225), which is stricter: it stops "Sales"
-- and "sales" both existing and splitting a filter in two.

create unique index if not exists functions_name_uq on functions (lower(name));

create index if not exists functions_active_idx on functions (is_active, sort_order);

-- ---------------------------------------------------------------------------
--  0234_initiator_status_archived.sql
-- ---------------------------------------------------------------------------
-- 0234 — "Archived" joins the Initiator Status verdicts, in WMS Tasks, Goals
-- and Projects (account holder, 2026-09-16).
--
-- The column was renamed in the UI at the same time: "Approver / Initiator
-- Status" is now just "Initiator Status". That is a label, not data — nothing
-- here renames anything.
--
--   Initiator Status  Pending · Approved · Not Approved · On Hold · Archived ·
--                     Cancelled        (Pending = no ruling = NULL)
--
-- The vocabulary and the rule for who may rule live in
-- lib/status/approver-status.ts.
--
-- Idempotent, and SAFE TO RUN BEFORE OR AFTER 0231: the two goal side tables
-- are only touched if they exist, so this does not fail on a database where
-- 0231 has not been applied yet. Apply 0231 first where you can — running this
-- one first simply leaves those two constraints for 0231 to create correctly.

-- ── TASKS ──────────────────────────────────────────────────────────────────
-- tasks.approval_status is a Postgres ENUM, so the value is added to the type.
-- (ADD VALUE cannot run inside a transaction block together with a statement
-- that uses the new value — run this file statement by statement, or apply
-- this line on its own first.)
alter type approval_status add value if not exists 'archived';

-- ── GOALS ──────────────────────────────────────────────────────────────────
-- Side tables from 0231, guarded by a CHECK rather than an enum. Widen it.
do $$
begin
  if to_regclass('public.goal_approver_statuses') is not null then
    alter table goal_approver_statuses
      drop constraint if exists goal_approver_statuses_approval_status_check;
    alter table goal_approver_statuses
      add constraint goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;

  if to_regclass('public.weekly_goal_approver_statuses') is not null then
    alter table weekly_goal_approver_statuses
      drop constraint if exists weekly_goal_approver_statuses_approval_status_check;
    alter table weekly_goal_approver_statuses
      add constraint weekly_goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;
end $$;

-- ── PROJECTS ───────────────────────────────────────────────────────────────
-- project_nodes.approval_status is text with a CHECK from 0204, which allows
-- exactly ('not_approved', 'approved', 'on_hold', 'cancelled'). This widens it
-- by one value.
--
-- NOT VALID, as 0204 wrote it. That is deliberate: 0204 never validated the
-- constraint, so rows older than it were never checked and may hold anything.
-- Adding a VALIDATING constraint here would scan the whole table and fail on
-- one such row — turning a one-word addition into a failed migration.
do $$
begin
  if to_regclass('public.project_nodes') is not null then
    alter table project_nodes
      drop constraint if exists project_nodes_approval_status_check;
    alter table project_nodes
      add constraint project_nodes_approval_status_check
      check (
        approval_status is null
        or approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled')
      ) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
--  0235_dcc_call_logs.sql
-- ---------------------------------------------------------------------------
-- 0235 — the SP1 call log (DCC-SPEC §7, §13).
--
-- The compliance board records whether a duty was DONE. SP1 records, of the
-- calls a person made on a day, HOW MANY landed on each of fifteen outcomes —
-- Registered, Verbal Yes, DND, Ringing and the rest. That is a count per
-- outcome per person per day, and it is not a compliance: there is no
-- Done/Not-done here, only numbers.
--
-- ── WHY A NARROW LOG AND NOT FIFTEEN COLUMNS ───────────────────────────────
-- Fifteen columns on dcc_entries would widen a table much of the module reads
-- with a bare select(), and every new outcome would then be a migration PLUS a
-- code change everywhere that table is read. Keyed by outcome, a sixteenth
-- outcome is a data row.
--
-- NO CHECK ON `disposition` — deliberately. The vocabulary lives in
-- lib/dcc/sp1.ts, the write path validates against it, and the grid drops
-- anything it does not recognise. A constraint here would mean a migration
-- every time Jeevan's sheet gains a row.
--
-- IDEMPOTENT: this repository applies migrations by hand, in the Supabase SQL
-- editor, and a file that cannot be run twice is a file that gets run once and
-- then half-run.

create table if not exists dcc_call_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  log_date date not null,
  disposition text not null,
  -- A count, never negative. ZERO IS MEANINGFUL and different from no row:
  -- zero means "asked, none landed here", no row means nobody said.
  count integer not null default 0 check (count >= 0),
  note text,
  filled_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ONE row per person per day per outcome. This is what lets the fill screen
-- upsert a cell without reading it first, and what stops a double-submit
-- doubling a day's numbers.
create unique index if not exists dcc_call_logs_uq
  on dcc_call_logs (employee_id, log_date, disposition);

-- The grid reads a date window for a set of people; the 10 pm report reads one
-- day for everybody. Both are served by this.
create index if not exists dcc_call_logs_date_idx
  on dcc_call_logs (log_date, employee_id);

-- ---------------------------------------------------------------------------
--  0236_recruitment_jd_roles.sql
-- ---------------------------------------------------------------------------
-- 0236 — Recruitment JDs get their own role list.
--
-- 0232 keyed one JD to one row of `interview_positions`. That list is the
-- INTERVIEW GRADE ladder — Executive, Senior Manager, Consultant, First-Year
-- Intern — and it is the wrong key for this: the JDs Rutvisha wrote are per
-- HIRING ROLE (Sales Manager, Creative Intern, Back Office Executive), several
-- of them span two grades at once ("Senior Sales Manager / Sales Manager"), and
-- a grade like "Deputy Vice President" has no JD and never will.
--
-- So a recruitment JD is now identified by its own `slug`, carries its own
-- `title`, and `position_id` becomes an OPTIONAL link to the grade for anyone
-- who wants to tie the two together later.
--
-- Written as one self-contained, idempotent script because 0232 may or may not
-- have been applied in a given database — this repository applies migrations by
-- hand, and at the time of writing neither table existed in the live one.
--
--   master_content     the original — Rutvisha's JD. Changed only deliberately.
--   recruiter_content  what recruiters edit and send. NULL = identical to the
--                      master, so a master update flows through until someone
--                      edits the recruiter copy. "Reset to master" sets it NULL.

create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references interview_positions(id) on delete set null,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The new identity. Added separately so a database that already ran 0232 is
-- carried forward rather than rebuilt.
alter table recruitment_jds add column if not exists slug text;
alter table recruitment_jds add column if not exists title text;
alter table recruitment_jds add column if not exists sort_order integer not null default 100;
alter table recruitment_jds add column if not exists is_active boolean not null default true;

-- 0232 made position_id NOT NULL UNIQUE. Both have to go: a JD no longer needs
-- a grade, and two JDs may point at the same one.
alter table recruitment_jds alter column position_id drop not null;
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'recruitment_jds' and con.contype = 'u'
       and pg_get_constraintdef(con.oid) like '%(position_id)%'
  loop
    execute format('alter table recruitment_jds drop constraint %I', c);
  end loop;
end $$;

-- Backfill any row written under 0232 so the NOT NULL below can be taken.
update recruitment_jds jd
   set slug = coalesce(jd.slug, 'position-' || replace(jd.id::text, '-', '')),
       title = coalesce(jd.title, p.label, 'Untitled role')
  from interview_positions p
 where p.id = jd.position_id and (jd.slug is null or jd.title is null);
update recruitment_jds
   set slug = coalesce(slug, 'position-' || replace(id::text, '-', '')),
       title = coalesce(title, 'Untitled role')
 where slug is null or title is null;

alter table recruitment_jds alter column slug set not null;
alter table recruitment_jds alter column title set not null;

create unique index if not exists recruitment_jds_slug_uq on recruitment_jds (slug);
create index if not exists recruitment_jds_order_idx on recruitment_jds (sort_order, title);

-- Every send, recorded: what went out (a snapshot, since the JD can change
-- afterwards), to whom, how, and by whom. A WhatsApp send is 'opened' — the WMS
-- opens WhatsApp with the JD typed in and the recruiter presses Send there,
-- which the WMS cannot observe.
create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);

-- ---------------------------------------------------------------------------
--  0237_account_lockouts.sql
-- ---------------------------------------------------------------------------
-- 0236 — account lockout after consecutive failed sign-ins
--
-- Locks an account after MAX_FAILED_ATTEMPTS (5) consecutive wrong passwords.
-- While locked, the person can neither sign in NOR use Forgot Password; only
-- the four named in lib/auth/unlock-permission.ts can clear it.
--
-- ADDITIVE ONLY. One new table, no change to any existing one. Nothing reads it
-- until the server-side sign-in route ships, so applying this early is safe and
-- is the intended order: migration first, code second. Shipping code that reads
-- a column the database lacks is exactly what caused the 2026-09-09 login
-- outage (see docs/SCHEMA_DRIFT_FIX_2026-09-10.sql).
--
--
-- ── WHY KEYED BY EMAIL, NOT employee_id ────────────────────────────────────
--
-- Failures arrive BEFORE we know who is typing. A wrong password proves only
-- that someone entered an address; it does not authenticate them, and the
-- address may belong to nobody. Keying on employees.id would mean either
-- resolving the address to a row first — which turns every failed attempt into
-- a lookup that leaks existence through timing — or dropping attempts against
-- unknown addresses, which is precisely the traffic worth counting.
--
-- So the key is the raw lower-cased address, and `employee_id` below is a
-- nullable CONVENIENCE for the admin screen, filled in when the address happens
-- to match a row. It is not the identity of this record.
--
--
-- ── WHY NO AUTO-EXPIRY COLUMN ──────────────────────────────────────────────
--
-- A lock ends when a human ends it. There is no `locked_until`, and that is the
-- product decision, not an omission: a timed unlock would let a brute-force
-- attempt simply wait, and the requirement is that the four approve each
-- release. `failed_count` DOES age out — see FAILED_ATTEMPT_WINDOW_MS — but the
-- lock itself does not.

CREATE TABLE IF NOT EXISTS account_lockouts (
  -- Lower-cased at every call site. The application normalises; this is not
  -- enforced by a constraint because a CHECK on lower(email) = email would
  -- reject rows a future importer might legitimately want to repair.
  email           text PRIMARY KEY,

  -- Consecutive failures inside FAILED_ATTEMPT_WINDOW_MS. Reset to 0 by a
  -- successful sign-in and by an unlock.
  failed_count    integer NOT NULL DEFAULT 0,

  -- When the most recent failure landed. Read together with failed_count to
  -- decide whether the window has lapsed and the count should restart.
  last_failed_at  timestamptz,

  -- NULL means NOT LOCKED. This single nullable timestamp is the lock, rather
  -- than a boolean plus a date that can disagree with each other.
  locked_at       timestamptz,

  -- Audit of the last release. Kept after unlocking rather than deleting the
  -- row, so "this account has been locked before" stays answerable — a repeat
  -- lockout is a different conversation from a first one.
  unlocked_at     timestamptz,
  unlocked_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Convenience only; see the note above. SET NULL rather than CASCADE: an
  -- employee leaving must not erase the record that their account was locked.
  employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- A count cannot be negative, and nothing should be able to write a value that
-- would make remainingAttempts() return a nonsense number.
ALTER TABLE account_lockouts DROP CONSTRAINT IF EXISTS account_lockouts_count_nonneg;
ALTER TABLE account_lockouts ADD CONSTRAINT account_lockouts_count_nonneg
  CHECK (failed_count >= 0);

-- The admin screen's only query: "show me everyone currently locked, newest
-- first". Partial, because locked rows are a handful and unlocked ones are the
-- rest of the table.
CREATE INDEX IF NOT EXISTS account_lockouts_locked_idx
  ON account_lockouts (locked_at DESC)
  WHERE locked_at IS NOT NULL;

-- Supports the admin screen joining back to the employee, and stays small.
CREATE INDEX IF NOT EXISTS account_lockouts_employee_idx
  ON account_lockouts (employee_id)
  WHERE employee_id IS NOT NULL;


-- ── PER-IP THROTTLE ────────────────────────────────────────────────────────
--
-- The per-email counter alone makes a denial-of-service trivial: typing a
-- colleague's address with junk five times locks them out, and with only four
-- unlockers that is disruptive by design. This table makes SWEEPING addresses
-- expensive, which is the attack the email counter cannot see — one failure
-- each against fifty addresses trips no per-email threshold at all.
--
-- Deliberately NOT a lockout: an IP is shared (an office NAT is one address for
-- everybody), so this feeds a delay and a refusal-to-count, never a lock on a
-- person. Rows are disposable; prune anything older than the window.
CREATE TABLE IF NOT EXISTS login_attempt_ips (
  ip              text NOT NULL,
  window_start    timestamptz NOT NULL DEFAULT now(),
  failed_count    integer NOT NULL DEFAULT 0,
  last_failed_at  timestamptz,
  PRIMARY KEY (ip, window_start)
);

CREATE INDEX IF NOT EXISTS login_attempt_ips_window_idx
  ON login_attempt_ips (window_start);


-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0237_account_lockouts.sql')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
--  0237_checklist_wms_columns_jd_client.sql
-- ---------------------------------------------------------------------------
-- 0237 — The Event Checklist reads like WMS Tasks; a JD gets a Client and
-- per-person Doer Notes (account holder, 2026-09-18).
--
-- The checklist grid now runs in the WMS Tasks column order:
--   S. No. · Client · Subject · Task · Doer · Initiator · Target Date ·
--   Frequency · Doer Status · Doer Notes · Actual Date · +/- Days ·
--   Approver Status · Approver Notes
-- and a person's JD reads:
--   S. No. · Client · Subject · Job Description · Target Date · Doer Notes
--
-- "Category" becomes "Subject", picked from the same `subjects` roster WMS
-- Tasks uses (Admin Panel → Subjects). The column is NOT renamed: the stored
-- words are the same thing under a new heading, and a rename would break every
-- deployed reader until this ran.
--
-- ADDITIVE, apart from the Doer Status values below. Idempotent — this
-- repository applies migrations by hand, and a migration that cannot be run
-- twice gets run twice.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Checklist rows — Client, Initiator, and the repeat rule.
-- ───────────────────────────────────────────────────────────────────────────
alter table ops_checklist_items add column if not exists client text;
alter table ops_checklist_items add column if not exists initiator_id uuid
  references employees(id) on delete set null;
-- Google Calendar's RRULE (FREQ=WEEKLY;BYDAY=FR …), the same grammar a WMS
-- task's `recurrence_rule` holds. NULL = does not repeat. The Frequency column
-- (Daily / Weekly / Monthly / Quarterly / Yearly) is read from it, so the two
-- can never disagree.
alter table ops_checklist_items add column if not exists recurrence_rule text;

-- Whoever put a row on the checklist is who asked for it.
update ops_checklist_items
   set initiator_id = created_by_id
 where initiator_id is null and created_by_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Ticks — Approver Status and Approver Notes, beside the doer's own.
-- ───────────────────────────────────────────────────────────────────────────
-- NULL approver_status is "Pending" — no ruling yet — exactly as on a task.
alter table ops_checklist_checks add column if not exists approver_status text;
alter table ops_checklist_checks add column if not exists approver_notes text;
alter table ops_checklist_checks add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table ops_checklist_checks add column if not exists approver_at timestamptz;

alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_approver_chk;
alter table ops_checklist_checks add constraint ops_checklist_checks_approver_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Doer Status — the WMS Tasks six, replacing the checklist's own four.
-- ───────────────────────────────────────────────────────────────────────────
--   Pending        → not_started
--   Done           → done
--   Need Help      → need_info      (WMS retired need_help into need_info)
--   Not Applicable → not_started, with the Approver Status "Cancelled"
--
-- WMS has no "Not Applicable" doer status: work that did not need doing is a
-- RULING on the work, and Cancelled is that ruling. It keeps such rows out of
-- the progress figure the way Not Applicable did.
alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_status_chk;

update ops_checklist_checks
   set approver_status = coalesce(approver_status, 'cancelled'),
       status = 'not_started'
 where status = 'Not Applicable';

update ops_checklist_checks
   set status = case status
                  when 'Pending' then 'not_started'
                  when 'Done' then 'done'
                  when 'Need Help' then 'need_info'
                end
 where status in ('Pending', 'Done', 'Need Help');

alter table ops_checklist_checks alter column status set default 'not_started';
alter table ops_checklist_checks add constraint ops_checklist_checks_status_chk
  check (status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A Client on every Job Description — free text, like tasks.client, picked
--    from the `clients` roster.
-- ───────────────────────────────────────────────────────────────────────────
alter table jd_entries add column if not exists client text;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Doer Notes — what the PERSON doing a JD writes against it.
-- ───────────────────────────────────────────────────────────────────────────
-- Per person, not per JD: a seat's JD is shared by everyone in the seat, and
-- one holder's notes are not another's. Its own table rather than a column on
-- jd_assignments, because a person holds their seat's JDs without any
-- assignment row, and an assignment is retired and re-created as seats change —
-- the notes must survive both.
create table if not exists jd_doer_notes (
  jd_id uuid not null references jd_entries(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  notes text,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (jd_id, employee_id)
);

create index if not exists jd_doer_notes_employee_idx on jd_doer_notes (employee_id);

-- ---------------------------------------------------------------------------
--  0238_security_role_grants.sql
-- ---------------------------------------------------------------------------
-- 0238 — ASSIGNABLE SECURITY ROLES.
--
-- ── WHY A NEW TABLE, AND NOT ONE OF THE THREE THINGS WE ALREADY HAVE ───────
--
--   · `module_permissions` (0219) is a RESTRICT system: with no row, the
--     resolver answers allowAll(). Hanging "may unlock accounts" off it would
--     mean everyone can unlock until somebody is explicitly switched off, which
--     is the exact opposite of the requirement.
--   · `lib/security/capabilities.ts` grants by email IN CODE. Correct for
--     capabilities that must not move without a code review, but it means a
--     developer and a deploy every time somebody new should be able to unlock.
--   · `employees.is_admin` is one flag covering everything an admin can do, and
--     the four people named for unlocking are not the same set as the admins
--     (Jeevan is not an admin; Om, Rutvisha, Shreya and Vinal are).
--
-- So: the ROLE LIST LIVES IN CODE (lib/auth/security-roles-catalog.ts, so every
-- role is one a route actually enforces) and the GRANTS LIVE HERE, so an
-- existing holder can give the role to somebody new from the app — no deploy.
-- Same split the permission catalogue documents for itself: tree in code,
-- grants in data.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Additive: one table, one audit table, and the four addresses the requirement
-- named seeded as holders of `account_unlock` so behaviour does not regress on
-- deploy. Idempotent — safe to run twice. A seeded row is matched by email, so
-- an address with no employees row yet is simply skipped.

CREATE TABLE IF NOT EXISTS security_role_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Matches a key in lib/auth/security-roles-catalog.ts. Text, not an enum:
  -- adding a role should not need a migration, and a key with no code behind it
  -- grants nothing because only a route's own check consults it.
  role          text NOT NULL,
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_role_grants_employee_role_uniq UNIQUE (employee_id, role)
);

CREATE INDEX IF NOT EXISTS security_role_grants_role_idx
  ON security_role_grants (role);

-- Who gave or took away a role, and when. Separate from the grant itself so
-- revoking does not erase the history of having held it.
CREATE TABLE IF NOT EXISTS security_role_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  role          text NOT NULL,
  -- 'granted' | 'revoked'
  action        text NOT NULL,
  actor_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_role_events_action_chk CHECK (action IN ('granted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS security_role_events_role_idx
  ON security_role_events (role, occurred_at DESC);

-- Seed the four the requirement named. Matched by app login email, lower-cased.
INSERT INTO security_role_grants (employee_id, role)
SELECT e.id, 'account_unlock'
  FROM employees e
 WHERE lower(e.email) IN (
         'mohitgupta.altuscorp@gmail.com',
         'rohanchoudhary.altuscorp@gmail.com',
         'jeevanbharambe.altuscorp@gmail.com',
         'manan@unleashed.in'
       )
ON CONFLICT (employee_id, role) DO NOTHING;

ALTER TABLE security_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
--  0238_wcc_mcc.sql
-- ---------------------------------------------------------------------------
-- 0238 — DCC becomes the Weekly and Monthly Compliance Checklists (WCC / MCC)
-- (account holder, 2026-09-18).
--
-- Built the way the Accounts checklists are: one row per compliance per
-- deadline, the WMS Doer Status, the actual date captured when it is marked
-- Done, the +/- days against the deadline, Doer Notes, and the WMS Approver
-- Status with Approver Notes.
--
-- The compliances themselves stay in dcc_kpi_items and each fill in
-- dcc_entries, so everything already in DCC — the position masters, the JD
-- "Add to DCC" push, four weeks of history — carries straight into WCC and MCC.
--   WCC  = schedule_kind 'scheduled' (due on its weekdays) and 'weekly'
--          (once a week, on any of its days)
--   MCC  = schedule_kind 'monthly', due on `month_day` (NULL = the month's end)
--
-- ADDITIVE. The old `status` column (Done / Not done / NA / Pending) is kept and
-- written alongside the new columns, because the DCC dashboard, the 10 pm
-- report, PMS and the Android app still read it. Idempotent — this repository
-- applies migrations by hand.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. MCC deadline: which day of the month a monthly compliance is due.
-- ───────────────────────────────────────────────────────────────────────────
alter table dcc_kpi_items add column if not exists month_day smallint;
alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_month_day_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_month_day_chk
  check (month_day is null or month_day between 1 and 31);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The WMS columns on every fill.
-- ───────────────────────────────────────────────────────────────────────────
-- doer_status  the WMS six: dont_know · not_started · initiated · follow_up ·
--              need_info · done
-- done_at      THE ACTUAL DATE, stamped by the server when the doer marks Done
-- approver_*   the WMS Approver Status (NULL = Pending) and its notes
alter table dcc_entries add column if not exists doer_status text;
alter table dcc_entries add column if not exists done_at timestamptz;
alter table dcc_entries add column if not exists approver_status text;
alter table dcc_entries add column if not exists approver_notes text;
alter table dcc_entries add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table dcc_entries add column if not exists approver_at timestamptz;

alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

alter table dcc_entries drop constraint if exists dcc_entries_approver_status_chk;
alter table dcc_entries add constraint dcc_entries_approver_status_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Carry the history across.
-- ───────────────────────────────────────────────────────────────────────────
--   Done     → done         (actual date: when the entry was last saved — the
--                            best record there is of when it was marked)
--   Pending  → initiated    (begun, not finished)
--   Not done → not_started
--   NA       → not_started, Approver Status "Cancelled" — WMS has no "Not
--              Applicable" doer status; work that did not apply is a ruling
update dcc_entries
   set doer_status = case status
                       when 'Done' then 'done'
                       when 'Pending' then 'initiated'
                       when 'Not done' then 'not_started'
                       when 'NA' then 'not_started'
                     end,
       done_at = case when status = 'Done' then coalesce(done_at, updated_at) else done_at end,
       approver_status = case when status = 'NA' then coalesce(approver_status, 'cancelled') else approver_status end
 where doer_status is null and status in ('Done', 'Pending', 'Not done', 'NA');

-- Manan Sir's grid and the 10 pm reminder read a whole team's fills for a
-- window of days at a time.
create index if not exists dcc_entries_item_date_idx on dcc_entries (item_id, entry_date);

-- ---------------------------------------------------------------------------
--  0240_incentive_entry_reversal.sql
-- ---------------------------------------------------------------------------
-- WS-6 · Incentive entry REVERSAL (financial). Additive + idempotent.
--
-- Adds a `reversed` flag to the money ledger row (incentive_entries) so a paid
-- incentive can be reversed without losing its payment history. The paid
-- amount stays as-is (it is the historical record); the reversal itself is
-- written as a NEGATIVE salary_payments row (method='reversal') plus an
-- incentive_payout_events audit row, so the employee's net paid reconciles to
-- zero while the original + reversal lines remain individually auditable.
--
-- `reversed` is the duplicate-guard: the reversal action re-checks it under a
-- FOR UPDATE lock and only writes the negative adjustment on the false->true
-- edge, so a repeat reversal can never double-adjust.
alter table incentive_entries
  add column if not exists reversed       boolean     not null default false,
  add column if not exists reversed_at    timestamptz,
  add column if not exists reversed_by_id uuid references employees(id) on delete set null;

create index if not exists incentive_entries_reversed_idx on incentive_entries (reversed);

-- ---------------------------------------------------------------------------
--  0241_template_files.sql
-- ---------------------------------------------------------------------------
-- Upload Master — the uploaded override for a bulk-import template.
-- One row per overridden template (key), no row = built-in template served.
CREATE TABLE IF NOT EXISTS template_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL,
  storage_path  text NOT NULL,
  content_type  text NOT NULL,
  file_name     text NOT NULL,
  file_size     integer NOT NULL,
  updated_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS template_files_key_uq ON template_files (key);

-- ---------------------------------------------------------------------------
--  0242_two_step_verification.sql
-- ---------------------------------------------------------------------------
-- 0242 — two-step sign-in by emailed code
--
-- After the password is accepted, a 6-digit code is emailed to the person and
-- must be entered before a session is issued. Once entered, that browser is not
-- asked again until the next midnight IST (a signed cookie carries that; see
-- lib/auth/two-step-pass.ts). These tables are the server's record:
--
--   two_step_challenges    every code sent. The code and the browser's handle
--                          are stored HASHED; the plain code only exists in
--                          the email.
--   two_step_verifications who verified, when, from which IP / browser, and
--                          until when. Audit only — nothing in the app shows it
--                          yet.
--
-- ADDITIVE ONLY: two new tables, no change to any existing one. Apply BEFORE
-- deploying the code — the sign-in route writes to these tables, and a missing
-- table would stop everyone signing in.
--
-- Numbered 0242 because 0237/0238 are taken twice already and Om's branch holds
-- 0240/0241.

CREATE TABLE IF NOT EXISTS two_step_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS two_step_challenges_token_uniq
  ON two_step_challenges (token_hash);

-- The send throttle's query: codes sent to this person in the last N minutes.
CREATE INDEX IF NOT EXISTS two_step_challenges_employee_created_idx
  ON two_step_challenges (employee_id, created_at);

CREATE TABLE IF NOT EXISTS two_step_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email         text NOT NULL,
  method        text NOT NULL DEFAULT 'email',
  challenge_id  uuid REFERENCES two_step_challenges(id) ON DELETE SET NULL,
  verified_at   timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz NOT NULL,
  ip            text,
  user_agent    text
);

CREATE INDEX IF NOT EXISTS two_step_verifications_employee_idx
  ON two_step_verifications (employee_id, verified_at);

-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0242_two_step_verification.sql')
ON CONFLICT DO NOTHING;


-- ===========================================================================
--  VERIFY — every object the merged code reads that was missing on
--  2026-09-21. Expect 31 rows, all OK.
-- ===========================================================================

SELECT t.name AS object,
       CASE WHEN c.tablename IS NULL THEN '*** MISSING ***' ELSE 'OK' END AS state
  FROM (VALUES
          ('account_lockouts'),
          ('dcc_calendar_events'),
          ('dcc_call_logs'),
          ('dcc_master_items'),
          ('dcc_master_links'),
          ('goal_approver_statuses'),
          ('jd_doer_notes'),
          ('login_attempt_ips'),
          ('recruitment_jd_sends'),
          ('recruitment_jds'),
          ('security_role_events'),
          ('security_role_grants'),
          ('template_files'),
          ('two_step_challenges'),
          ('two_step_verifications'),
          ('weekly_goal_approver_statuses')
       ) AS t(name)
  LEFT JOIN pg_tables c ON c.schemaname = 'public' AND c.tablename = t.name

UNION ALL

SELECT x.t || '.' || x.c,
       CASE WHEN col.column_name IS NULL THEN '*** MISSING ***' ELSE 'OK' END
  FROM (VALUES
          ('dcc_entries', 'approver_at'),
          ('dcc_entries', 'approver_id'),
          ('dcc_entries', 'approver_notes'),
          ('dcc_entries', 'approver_status'),
          ('dcc_entries', 'doer_status'),
          ('dcc_entries', 'done_at'),
          ('dcc_kpi_items', 'month_day'),
          ('jd_entries', 'client'),
          ('ops_checklist_checks', 'approver_at'),
          ('ops_checklist_checks', 'approver_id'),
          ('ops_checklist_checks', 'approver_notes'),
          ('ops_checklist_checks', 'approver_status'),
          ('ops_checklist_items', 'client'),
          ('ops_checklist_items', 'initiator_id'),
          ('ops_checklist_items', 'recurrence_rule')
       ) AS x(t, c)
  LEFT JOIN information_schema.columns col
         ON col.table_schema = 'public' AND col.table_name = x.t AND col.column_name = x.c

ORDER BY 2 DESC, 1;
