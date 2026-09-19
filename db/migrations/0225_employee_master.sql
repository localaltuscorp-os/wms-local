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
