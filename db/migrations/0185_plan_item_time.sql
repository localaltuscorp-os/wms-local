-- 0185 — a TIME on a Plan My Day commitment (Sir: "like Google Calendar —
-- when a person adds their work, I want their time").
--
-- WHY MINUTES-OF-DAY AND NOT A TIMESTAMP: a daily_checklist row is already
-- pinned to a calendar day by `plan_date`, so all it needs is the wall-clock
-- position inside that day. Storing minutes-from-midnight means
--   · no timezone conversion anywhere (the team's clock is IST, and the day is
--     already an IST day — a timestamptz would re-open the UTC/IST drift every
--     other query in this module works hard to avoid), and
--   · moving a commitment to another day KEEPS its time for free: the move
--     rewrites plan_date and the 10:00 stays 10:00.
--
-- Both nullable: a commitment with no time is legitimate ("Anytime" work) and
-- is exactly how every existing row starts.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS everywhere) — the drizzle journal in this repo
-- is out of sync, so migrations are applied by running this SQL directly.

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS start_min    integer,
  ADD COLUMN IF NOT EXISTS duration_min integer;

-- Sanity rails: a real minute of a real day, and a sane block length.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_checklist_start_min_range'
  ) THEN
    ALTER TABLE daily_checklist
      ADD CONSTRAINT daily_checklist_start_min_range
      CHECK (start_min IS NULL OR (start_min >= 0 AND start_min < 1440));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_checklist_duration_min_range'
  ) THEN
    ALTER TABLE daily_checklist
      ADD CONSTRAINT daily_checklist_duration_min_range
      CHECK (duration_min IS NULL OR (duration_min > 0 AND duration_min <= 1440));
  END IF;
END $$;

-- The timeline reads one employee-day in start order.
CREATE INDEX IF NOT EXISTS daily_checklist_emp_date_start_idx
  ON daily_checklist (employee_id, plan_date, start_min);
