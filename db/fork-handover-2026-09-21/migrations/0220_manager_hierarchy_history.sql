-- 0220 — REPORTING-MANAGER HISTORY.
--
-- ── WHAT STAYS CANONICAL ───────────────────────────────────────────────────
-- `employees.manager_id` remains THE reporting relationship, and this migration
-- does not touch it. It is already the single source of truth: the audit found
-- ~20 modules (tasks, goals, DCC, KPI, PMS, appraisal, attendance analytics,
-- manager dashboards, approvals) and every one of them resolves the manager by
-- reading that column at query time. None of them stores its own copy. So
-- changing an employee's manager already propagates everywhere, immediately,
-- with no fan-out writes — which is why this migration adds no triggers and
-- rewrites no rows.
--
-- ── WHAT WAS MISSING ───────────────────────────────────────────────────────
-- The opposite: HISTORY. Because the current manager is a single mutable column,
-- moving Rudra from Rohan to Rutvisha in September silently rewrites August too
-- — every "my team last month" report, every past approval trail and every
-- historical KPI roll-up re-reads the NEW manager. The brief asks for exactly
-- this not to happen: "August historical records should continue reflecting the
-- historical relationship where appropriate. September onward should use
-- Rutvisha."
--
-- This table is that record. It does not replace `manager_id`; it remembers what
-- `manager_id` used to be, and when, so a report about a past period can ask who
-- the manager WAS on that date instead of who it is now.
--
-- ── INTERVALS, NOT EVENTS ──────────────────────────────────────────────────
-- One row per period, with an open end for the current one. A log of change
-- events would need every reader to reconstruct the intervals itself — sort by
-- date, pair consecutive rows, handle the first and last — and "who managed X on
-- 2026-08-15" is the only question anyone asks. Storing the answer directly
-- makes that a single indexed row lookup.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

CREATE TABLE IF NOT EXISTS employee_manager_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- NULLABLE, and null is meaningful: it records a period during which the
  -- person reported to NOBODY. That is a real state here — managers themselves
  -- currently have no manager assigned (see lib/auth/founder.ts, which exists
  -- precisely because `manager_id IS NULL` must not be read as "is a founder").
  -- Recording the gap is what lets a later report tell "unassigned" apart from
  -- "we have no data for that month".
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- DATES, not timestamps. Every consumer of the hierarchy works in whole days
  -- or whole months — attendance is keyed by `log_date`, goals by week start,
  -- KPI and salary by month — so a mid-day boundary could only ever create
  -- disagreement between two readers of the same change.
  effective_from date NOT NULL,

  -- NULL = the CURRENT period. Exactly one open row per employee (enforced
  -- below), and it is the one that must agree with `employees.manager_id`.
  effective_to date,

  changed_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Why the move happened, if whoever made it said so. Same reasoning as the
  -- reason field on a device revocation (0215).
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- An interval must not end before it starts. `effective_to = effective_from`
  -- is allowed: a manager assigned and moved again the same day leaves a
  -- single-day period, and refusing to record it would lose the fact that it
  -- happened.
  CONSTRAINT employee_manager_history_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),

  -- Nobody reports to themselves.
  CONSTRAINT employee_manager_history_no_self CHECK (
    manager_id IS NULL OR manager_id <> employee_id
  )
);

-- EXACTLY ONE OPEN PERIOD PER EMPLOYEE.
--
-- The invariant the whole table rests on: if two rows were open, "who is their
-- manager now" would have two answers in the history while `manager_id` had
-- one, and the two stores would disagree with no way to tell which was right.
-- A partial unique index makes that state unrepresentable.
CREATE UNIQUE INDEX IF NOT EXISTS employee_manager_history_one_open_idx
  ON employee_manager_history (employee_id)
  WHERE effective_to IS NULL;

-- "Who managed this person on this date" — the only read pattern.
CREATE INDEX IF NOT EXISTS employee_manager_history_lookup_idx
  ON employee_manager_history (employee_id, effective_from DESC);

-- "Who reported to this manager during this period" — the team-level read, for
-- historical roll-ups and manager dashboards asked about a past month.
CREATE INDEX IF NOT EXISTS employee_manager_history_manager_idx
  ON employee_manager_history (manager_id, effective_from DESC);

------------------------------------------------------------------------
-- Backfill: one open period per employee, from what we can actually know
------------------------------------------------------------------------
-- The current `manager_id` is all the truth that exists today — there is no
-- record of any earlier arrangement, and this migration will not invent one.
--
-- `effective_from` is therefore the earliest date at which we can honestly say
-- the relationship held: the employee's joining date, falling back to when their
-- row was created. That is EARLIER than the relationship may actually have
-- started, which is the safe direction: a historical query about August returns
-- the only manager we ever knew about, rather than nothing at all.
--
-- Employees with NO manager are given a row too, with manager_id NULL. Without
-- it, their first assignment would open a period starting mid-history and every
-- date before it would read as "unknown" rather than "unassigned".
--
-- The WHERE NOT EXISTS makes the whole thing idempotent AND makes re-running it
-- harmless after real history has accumulated: an employee who already has an
-- open period is skipped entirely, so a re-apply cannot overwrite a recorded
-- move with the current column value.

INSERT INTO employee_manager_history (employee_id, manager_id, effective_from, note)
SELECT
  e.id,
  e.manager_id,
  COALESCE(e.joined_at::date, e.created_at::date, CURRENT_DATE),
  'Backfilled from employees.manager_id when reporting history was introduced (0220). The start date is the joining date, which is the earliest date this relationship can be asserted from — it is not evidence of when the reporting line actually began.'
FROM employees e
WHERE NOT EXISTS (
  SELECT 1
    FROM employee_manager_history h
   WHERE h.employee_id = e.id
     AND h.effective_to IS NULL
);
