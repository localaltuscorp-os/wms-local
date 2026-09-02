-- 0187 — automatic END-OF-DAY carry forward for daily commitments (Sir).
--
-- THE RULE: if a day ends and the employee never told us what happened to a
-- commitment, it must not evaporate. It moves to the next day, still open.
--
-- WHAT COUNTS AS "REVIEWED" — all three already exist in this table, which is
-- why no new state machine is needed:
--   · Mark Done          → done = true
--   · Pending            → closed_at stamped, done = false   (setPlanItemPending)
--   · Tomorrow/Day after → plan_date already moved            (transferPlanItem)
-- So "unreviewed" is exactly: still on a past plan_date, done = false,
-- closed_at IS NULL, abandoned_at IS NULL. An explicit action always wins,
-- because every one of them takes the row out of that set.
--
-- WHY A NEW COLUMN: `moved_from_date` alone can't tell an AUTOMATIC carry from a
-- manual "→ Tomorrow" — both re-date the row. This column records that the
-- SYSTEM moved it, so the card can say CARRIED FORWARD honestly and only then.
--
-- No duplicate rows are ever created: carry-forward is an UPDATE of plan_date on
-- the same record (rule 8), which is also what makes it idempotent — once moved,
-- the row is no longer on a past day, so a re-run finds nothing.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS everywhere) — the drizzle journal in this repo
-- is out of sync, so migrations are applied by running this SQL directly.

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS carried_forward_at timestamptz;

-- The nightly sweep looks for open, unreviewed rows on past days, per employee.
CREATE INDEX IF NOT EXISTS daily_checklist_unreviewed_idx
  ON daily_checklist (employee_id, plan_date)
  WHERE done = false AND closed_at IS NULL AND abandoned_at IS NULL;
