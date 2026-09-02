-- 0189 — the Monday "what last week cost you" acknowledgement (Sir).
--
-- THE RULE: on the first punch of a new week, an employee is shown last week's
-- ATTENDANCE LOST and MONEY LOST report and must dismiss it — like a skippable
-- ad — before they can clock in. One row here is the proof they read it.
--
-- WHY A TABLE AND NOT A FLAG ON `employees`: the acknowledgement is per WEEK,
-- and it has to stay readable afterwards. A single "last acknowledged" column
-- would overwrite itself every Monday and lose the history, and history is the
-- whole point of making someone click.
--
-- WHAT IS FROZEN HERE: `days_lost` / `money_lost` are copies of the figures the
-- person was ACTUALLY SHOWN, not a pointer to be re-derived later. Attendance
-- can be edited after the fact (punch-edit, a backfill, a leave approved late),
-- so re-deriving would silently rewrite what someone acknowledged. This is an
-- audit record: it must say what was on the screen.
--
-- `week_start` is the MONDAY of the week being REPORTED — i.e. the week that had
-- just ended when the dialog was shown, never the current week.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS everywhere) — the drizzle journal in this repo
-- is out of sync, so migrations are applied by running this SQL directly.

CREATE TABLE IF NOT EXISTS attendance_week_ack (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start        date NOT NULL,
  acknowledged_at   timestamptz NOT NULL DEFAULT now(),
  -- Frozen copies of what was on screen (see above).
  days_lost         numeric(6,2) NOT NULL DEFAULT 0,
  money_lost        numeric(12,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One acknowledgement per person per reported week. This is also what makes the
-- acknowledge action idempotent: a double-click, or two tabs racing, upserts
-- onto the same row instead of stacking duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_week_ack_emp_week_uq
  ON attendance_week_ack (employee_id, week_start);

-- The punch gate's read: "has THIS employee acknowledged THIS week yet".
-- Covered by the unique index above; this one serves the reverse question the
-- HR side asks — "who has not acknowledged week X yet".
CREATE INDEX IF NOT EXISTS attendance_week_ack_week_idx
  ON attendance_week_ack (week_start);
