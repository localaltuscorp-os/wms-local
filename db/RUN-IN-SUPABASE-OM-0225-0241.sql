-- ============================================================================
--  PART 1 — RUN IN SUPABASE: Om's migrations.
--    0225 employee master · 0226 billing master · 0227 entity code prefixes
--    0228 schedule settings · 0229 incentive split · 0230 approval workflow
--    0231 incentive notifications · 0232 incentive master (as merged)
--    0234 functions replace departments · 0240 entry reversal · 0241 template files
--
--  Run PART 0 (db/PREFLIGHT-OM-0225-0241.sql) first. Nothing in it may say
--  STOP. Then paste this whole file and run it ONCE.
--
--  0232 IS THE MERGED VERSION. It no longer creates its own
--  `incentive_eligibility`: Rohan's table from 0216 is kept, and the Incentive
--  Master now uses it. The version on Om's branch failed on real Postgres.
--
--  ONE TRANSACTION: if any statement fails, nothing at all changes.
--  ALL ARE IDEMPOTENT: running it twice is harmless.
--
--  Afterwards run PART 2 (db/VERIFY-OM-0225-0241.sql). Every row must PASS,
--  and the HR count must be no lower than PART 0's.
-- ============================================================================

BEGIN;

-- ── GUARD: stop with a readable reason, before anything changes ────────────
-- Everything here would otherwise fail halfway through with a constraint name,
-- or — for 0234 — quietly clear someone's Function. PART 0 shows the same
-- checks as a table; this repeats them so that skipping PART 0 cannot hurt.
DO $guard$
DECLARE
  n bigint;
  words text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'incentive_eligibility' AND column_name = 'incentive_id') THEN
    RAISE EXCEPTION 'STOP: incentive_eligibility is not Rohan''s table (no incentive_id). Nothing has been changed. Send this to Claude.';
  END IF;

  -- to_jsonb, because 0225 is what ADDS employee_code: before it, naming the
  -- column would fail this guard instead of passing it.
  SELECT string_agg(code, ', ') INTO words FROM (
    SELECT lower(to_jsonb(e) ->> 'employee_code') AS code
      FROM employees e
     WHERE to_jsonb(e) ->> 'employee_code' IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1) d;
  IF words IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: duplicate employee codes (0225 needs them unique): %. Nothing has been changed. Send this to Claude.', words;
  END IF;

  SELECT string_agg(DISTINCT quote_literal(status), ', ') INTO words
    FROM incentive_requests
   WHERE status IS NULL
      OR status NOT IN ('pending','approved','rejected','due','not_due','reversed','revision_requested');
  IF words IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: incentive requests hold statuses 0230 does not allow: %. Nothing has been changed. Send this to Claude.', words;
  END IF;

  SELECT count(*) INTO n FROM employees e
   WHERE e.department_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = e.department_id)
     AND NOT EXISTS (SELECT 1 FROM departments d
                      WHERE e.department IS NOT NULL AND lower(btrim(e.department)) = lower(d.name));
  IF n > 0 THEN
    RAISE EXCEPTION 'STOP: 0234 would clear the Function of % employee(s). Production was expected to have none. Nothing has been changed. Send this to Claude.', n;
  END IF;

  SELECT count(*) INTO n FROM employee_departments ed
   WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = ed.department_id);
  IF n > 0 THEN
    RAISE EXCEPTION 'STOP: 0234 would delete % extra-Function link(s). Production was expected to have none. Nothing has been changed. Send this to Claude.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM departments GROUP BY lower(name) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'STOP: two Functions share a name ignoring case; 0234''s unique index would fail. Nothing has been changed. Send this to Claude.';
  END IF;

  SELECT count(*) INTO n FROM jd_positions p
   WHERE p.department_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = p.department_id);
  IF n > 0 THEN
    RAISE EXCEPTION 'STOP: % JD position(s) point at a missing Function; 0234''s foreign key would fail. Nothing has been changed. Send this to Claude.', n;
  END IF;

  SELECT string_agg(name, ', ') INTO words FROM (
    SELECT name FROM paying_entities
     WHERE name IN ('Altus Corp','Unleashed','Khushboo','The Gainmakers (MJV HUF)','Legacy Creators (JSV HUF)')
     GROUP BY name HAVING count(*) > 1) x;
  IF words IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: paying entities named twice (0227 would give both the same letter): %. Nothing has been changed. Send this to Claude.', words;
  END IF;
END
$guard$;


-- ════════════════════════ 0225_employee_master.sql ════════════════════════

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

-- ════════════════════════ 0226_billing_master.sql ════════════════════════

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

-- ════════════════════════ 0227_entity_code_prefixes.sql ════════════════════════

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

-- ════════════════════════ 0228_employee_schedule_settings.sql ════════════════════════

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

-- ════════════════════════ 0229_incentive_request_split.sql ════════════════════════

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

-- ════════════════════════ 0230_incentive_approval_workflow.sql ════════════════════════

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

-- ════════════════════════ 0231_incentive_notifications.sql ════════════════════════

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

-- ════════════════════════ 0232_incentive_master.sql ════════════════════════

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

-- ════════════════════════ 0234_functions_replace_departments.sql ════════════════════════

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

-- ════════════════════════ 0240_incentive_entry_reversal.sql ════════════════════════

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

-- ════════════════════════ 0241_template_files.sql ════════════════════════

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

COMMIT;
