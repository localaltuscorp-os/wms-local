-- 0186 — cancelled DAILY COMMITMENTS go to the Recycle Bin (Sir: "when I am
-- cancelling, that task should move to recycle bin").
--
-- Before this, the card's × had two very different fates depending on what was
-- behind the row:
--   · a WMS task  → tasks.abandoned_at was stamped, so it landed in the bin and
--                   could be restored;
--   · a typed commitment or a goal row → the daily_checklist row was DELETED
--                   outright. Nothing to restore, nothing in the bin.
--
-- A commitment is real work someone committed to, so losing it to a mis-click is
-- exactly what a recycle bin exists to prevent. These two columns turn that hard
-- delete into a soft one, matching the shape `tasks` already uses (abandoned_at
-- + abandoned_by_id), so the bin can list, restore and purge all three families
-- the same way.
--
-- Every planner read must therefore filter `abandoned_at IS NULL` — see
-- app/(app)/goals/plan/payload.ts and lib/queries/daily-checklist.ts.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS everywhere) — the drizzle journal in this repo
-- is out of sync, so migrations are applied by running this SQL directly.

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS abandoned_at    timestamptz,
  ADD COLUMN IF NOT EXISTS abandoned_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- The planner reads one employee-day and always excludes binned rows; the bin
-- reads the binned ones newest-first. A partial index serves both.
CREATE INDEX IF NOT EXISTS daily_checklist_abandoned_idx
  ON daily_checklist (abandoned_at DESC)
  WHERE abandoned_at IS NOT NULL;
