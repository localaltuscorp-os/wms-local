-- 0212 — Offboarding: archive employees instead of destroying them.
--
-- WHY. `deleteEmployee` hard-deleted an employee by first destroying every
-- audit row that pointed at them — employee_events, task_events,
-- settings_events, document_events, outstanding_followups — because all of
-- those carry `actor_id ... ON DELETE RESTRICT`. Postgres was refusing to drop
-- the person while the company's own memory referenced them, and the code
-- answered by deleting the memory. One click destroyed 112 tasks and 522 audit
-- events belonging to the organisation in order to remove one login.
--
-- The split this migration introduces is the standard one: IDENTITY is deleted
-- (Firebase, avatar, eventually the PII), the RECORD is retained. The employees
-- row now lives forever as a former employee; `employee_exits` holds why they
-- left and where their work went.
--
-- Additive and idempotent throughout. Nothing here drops or rewrites data, and
-- every column is nullable or defaulted, so rows written before it read back
-- exactly as they did.

-- ── employees: lifecycle beyond is_active ──────────────────────────────────
-- `is_active` answers "can they sign in", and stays the login gate. It cannot
-- also answer "do they still work here" — a suspended employee is inactive but
-- current, and a former employee needs a state that survives being re-enabled
-- by accident. employment_status is that second axis.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_working_day date,
  -- LEGAL HOLD (idea 4). One boolean that exempts a person from every
  -- retention purge and from anonymisation. Set it when someone leaves under
  -- investigation: destroying data on a person you are investigating is
  -- spoliation, and no automated timer may be allowed to do it.
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text,
  -- Stamped when the PII has actually been pseudonymised (idea 5). Non-null
  -- means name/email on this row are placeholders, not the person's data.
  ADD COLUMN IF NOT EXISTS anonymised_at timestamptz;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_employment_status_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_employment_status_check
  CHECK (employment_status IN ('active', 'former', 'anonymised'));

CREATE INDEX IF NOT EXISTS employees_employment_status_idx
  ON employees (employment_status);

-- ── employee_exits: the exit record ────────────────────────────────────────
-- One row per departure. A separate table rather than more columns on
-- employees because it is written once, read rarely, and its access rules
-- differ — the exit interview is superadmin-only while the employees row is
-- read app-wide.
CREATE TABLE IF NOT EXISTS employee_exits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES employees (id) ON DELETE CASCADE,

  -- TAXONOMY, not free text — free text cannot be filtered, grouped or
  -- reported on, and attrition analysis is the whole point of capturing it.
  -- 'other' is the escape hatch: it keeps the column closed for filtering
  -- while still letting an admin describe a case the list does not cover, so
  -- the filter never breaks and nothing has to be forced into a wrong bucket.
  exit_reason text NOT NULL,
  exit_reason_other text,

  -- The single most-read field when someone reapplies two years later.
  rehire_eligibility text NOT NULL DEFAULT 'with_review',
  rehire_note text,

  -- Dates. joined_at is COPIED here rather than read from employees at display
  -- time: an exit record is a statement about the employment that ended, and
  -- must not silently change if someone later corrects the live row. The admin
  -- may amend the DOJ during the exit flow, and this is what they amended.
  joined_at timestamptz,
  resignation_date date,
  last_working_day date,

  -- Notice period — what payroll and any future background verification asks
  -- for.
  notice_served boolean,
  notice_days integer,
  paid_in_lieu boolean NOT NULL DEFAULT false,

  -- Where the work went. successor_id is ON DELETE SET NULL: the successor may
  -- themselves leave one day, and that must not erase the record that a
  -- handover happened.
  successor_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  reassigned jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Handover checklist and exit interview. jsonb rather than child tables:
  -- both are read as a whole, never queried field-by-field, and their shape is
  -- expected to change as HR refines the questions.
  handover jsonb NOT NULL DEFAULT '{}'::jsonb,
  exit_interview jsonb,

  -- What the irreversible half actually did, so the record does not claim more
  -- than happened. A Firebase outage must not leave us asserting the login is
  -- gone when it is not.
  firebase_deleted boolean NOT NULL DEFAULT false,
  firebase_error text,
  avatar_purged boolean NOT NULL DEFAULT false,

  notes text,
  archived_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  archived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_exits
  DROP CONSTRAINT IF EXISTS employee_exits_reason_check;
ALTER TABLE employee_exits
  ADD CONSTRAINT employee_exits_reason_check
  CHECK (exit_reason IN (
    'resigned', 'terminated_for_cause', 'redundancy', 'contract_ended',
    'abandonment', 'retirement', 'deceased', 'other'
  ));

-- 'other' without a description is an empty record that defeats the point of
-- having the bucket at all.
ALTER TABLE employee_exits
  DROP CONSTRAINT IF EXISTS employee_exits_other_needs_text;
ALTER TABLE employee_exits
  ADD CONSTRAINT employee_exits_other_needs_text
  CHECK (
    exit_reason <> 'other'
    OR nullif(btrim(coalesce(exit_reason_other, '')), '') IS NOT NULL
  );

ALTER TABLE employee_exits
  DROP CONSTRAINT IF EXISTS employee_exits_rehire_check;
ALTER TABLE employee_exits
  ADD CONSTRAINT employee_exits_rehire_check
  CHECK (rehire_eligibility IN ('yes', 'no', 'with_review'));

CREATE INDEX IF NOT EXISTS employee_exits_archived_at_idx ON employee_exits (archived_at DESC);
CREATE INDEX IF NOT EXISTS employee_exits_reason_idx ON employee_exits (exit_reason);
CREATE INDEX IF NOT EXISTS employee_exits_successor_idx ON employee_exits (successor_id);

-- ── data_retention_policies: the schedule as data ──────────────────────────
-- Retention lives in a table, not in constants, for two reasons: the periods
-- are set by law rather than by engineering, and an auditor asking "what is
-- your retention policy" needs an answer that is not a code review.
--
-- INDIAN STATUTORY PERIODS drive the seeds below. Attendance is the
-- evidentiary basis for wages paid, and the burden of proof in a wage dispute
-- sits with the employer — which is why attendance is 3 years here and not the
-- 60 days a UI would prefer. 60 days is a VIEW window, enforced in the query
-- layer, never by deletion.
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_class text NOT NULL UNIQUE,
  retention_days integer NOT NULL,
  legal_basis text NOT NULL,
  -- OFF by default, deliberately. A retention table that starts deleting the
  -- moment it is created is a data-loss incident wearing a policy costume.
  -- Each class is switched on consciously, once its purge path is proven.
  purge_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_retention_policies
  DROP CONSTRAINT IF EXISTS data_retention_positive;
ALTER TABLE data_retention_policies
  ADD CONSTRAINT data_retention_positive CHECK (retention_days > 0);

INSERT INTO data_retention_policies
  (record_class, retention_days, legal_basis, purge_enabled, notes)
VALUES
  ('attendance_records', 1095,
   'Maharashtra Shops & Establishments Act; Payment of Wages Act — muster/attendance registers, 3 years',
   false,
   'UI shows a 60-day window for former employees; rows are retained for the statutory period.'),
  ('payroll_records', 2920, 'PF & ESI contribution records — 8 years', false, NULL),
  ('income_tax_records', 2190, 'Income Tax Act — 6 years from end of assessment year', false, NULL),
  ('audit_events', 2555, 'Internal control / incident investigation — 7 years', false,
   'Never purge on exit. Misconduct is routinely discovered months after a departure.'),
  ('employee_pii', 2555,
   'Retained for statutory employment claims, then pseudonymised (not deleted)', false,
   'Drives anonymisation of former employees; legal_hold overrides it.'),
  ('work_session_shots', 7, 'Operational only — screen-share proof frames', true, NULL),
  ('exit_records', 2555, 'Employment verification requests — 7 years', false, NULL)
ON CONFLICT (record_class) DO NOTHING;
