-- 0215 — Goals: a real ARCHIVE, separate from the Recycle Bin.
--
-- ADDITIVE ONLY. One nullable timestamp per table plus two partial indexes, so
-- this rewrites zero rows and takes only a brief ACCESS EXCLUSIVE lock on the
-- catalogue.
--
-- WHY THIS COLUMN EXISTS
--
-- `goals.archived` / `weekly_goals.archived` are ALREADY taken, and they do not
-- mean what their name suggests: the Goals module sets that flag from its
-- Delete action and the Recycle Bin (/goals/recycle-bin) is the screen that
-- lists them. It is a soft-DELETE marker.
--
-- Sir (2026-09) asked for an Archive option on the goals table's selection bar,
-- beside Delete — the same gesture the WMS task list has, where archiving is
-- "put this away, it is finished with" and NOT "delete this". Overloading
-- `archived` would have made one flag mean two things and put every deleted
-- goal in the Archive: Delete and Archive would have been the same button
-- printed twice.
--
-- So the two states are now distinct and can both be true independently:
--
--   archived = true      the goal was DELETED  → /goals/recycle-bin
--   archived_at IS NOT NULL  the goal was ARCHIVED → /archive/goals
--
-- A TIMESTAMP, NOT A BOOLEAN, matching `tasks.abandoned_at`,
-- `employees.deactivated_at` and the rest of the schema: "when" is free to
-- record and answers the question a boolean cannot.
--
-- The indexes are PARTIAL — the archived rows are the small minority, and a
-- partial index on the non-null half stays tiny while still serving the
-- Archive's "everything this person put away" scan.

ALTER TABLE goals        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_archived_at_idx
  ON goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS weekly_goals_archived_at_idx
  ON weekly_goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;
