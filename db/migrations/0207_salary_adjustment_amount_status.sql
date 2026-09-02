-- 0207 — make a salary adjustment carry an AMOUNT and an APPROVAL STATE.
--
-- WHY: leave encashment is paid out at the close of each leave period, and the
-- decision was that it lands as an adjustment HR approves rather than straight
-- into payroll. `salary_adjustments` could express neither half of that. It has
-- `days` and a free-text `reason`, so an encashment could only ever be recorded
-- as a number of days with the rupees written into prose, and there was no way
-- at all to say whether a human had agreed to it.
--
-- WHY AN AMOUNT AND NOT JUST DAYS: leave encashment is explicitly valued on a
-- 31-DAY month (dailyRate = monthlyGross / 31), which is NOT the divisor payroll
-- uses for anything else — `salary_config.divisor_policy` is 'actual', i.e. the
-- real length of the month. Storing days and letting payroll multiply would
-- silently value a September encashment at /30 and a March one at /31. Storing
-- the money freezes the figure that was actually agreed, for the same reason a
-- salary run stores its own totals rather than re-deriving them later.
--
-- STATUS DEFAULTS TO 'pending' — including for the rows that already exist. That
-- is the safe direction: an adjustment nobody has looked at is not approved. The
-- table is empty in production, so this is a statement of intent rather than a
-- migration of anything.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply.

ALTER TABLE salary_adjustments
  ADD COLUMN IF NOT EXISTS amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE salary_adjustments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE salary_adjustments
  ADD COLUMN IF NOT EXISTS decided_by_id uuid REFERENCES employees (id) ON DELETE SET NULL;

ALTER TABLE salary_adjustments
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salary_adjustments_status_chk'
  ) THEN
    ALTER TABLE salary_adjustments
      ADD CONSTRAINT salary_adjustments_status_chk
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- A decided row must say who decided it and when — the same shape the remote
-- work requests use (0205), so "approved by nobody at no time" is unstateable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salary_adjustments_decided_chk'
  ) THEN
    ALTER TABLE salary_adjustments
      ADD CONSTRAINT salary_adjustments_decided_chk
      CHECK (status = 'pending' OR (decided_by_id IS NOT NULL AND decided_at IS NOT NULL));
  END IF;
END $$;

-- ONE encashment per employee per period. The generator is re-runnable and must
-- never double-pay someone because it was run twice at month end; this index is
-- what makes that guarantee structural rather than a promise in a script.
-- Partial, so it constrains encashments only and leaves every other adjustment
-- kind free to repeat within a month.
CREATE UNIQUE INDEX IF NOT EXISTS salary_adjustments_encashment_uq
  ON salary_adjustments (employee_id, month)
  WHERE kind = 'leave_encashment';

CREATE INDEX IF NOT EXISTS salary_adjustments_status_idx ON salary_adjustments (status);
