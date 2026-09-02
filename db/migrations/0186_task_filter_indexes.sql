-- 0186 — Task filter/sort indexes.
--
-- NOT APPLIED BY THIS CHANGE. Run it deliberately with `pnpm db:migrate`.
-- Every index below is CONCURRENTLY-safe in intent but written plain, because
-- the runner wraps migrations in a transaction and CREATE INDEX CONCURRENTLY
-- cannot run inside one. On a table this size the plain form takes a brief
-- ACCESS SHARE-blocking lock — schedule it, do not fire it mid-day.
--
-- ── What was asked for vs what exists ────────────────────────────────────────
-- The request named (start_time, end_time), (rework_count) and
-- (doer_id, status) "in the tasks schema". Only the last of those is a tasks
-- column pair. The other two do not exist anywhere under those names:
--
--   Start Time   = task_time_rollup.first_started_at  (the first Start press)
--   End Time     = tasks.completed_at                 (stamped by markDone)
--   Rework count = task_time_rollup.rejection_count
--
-- So the tasks-table composite is created here, and the rollup columns are
-- addressed below on the table that actually holds them.

-- ── 1. (doer_id, status) — the real gap ─────────────────────────────────────
-- tasks already has (doer_id, created_at) and (status, created_at), but nothing
-- leading with doer and narrowing by status. That is the exact shape of the
-- Status-by-Doer breakdown and of every "this person's open work" filter, both
-- of which currently take the doer index and then filter status row by row.
CREATE INDEX IF NOT EXISTS tasks_doer_status_idx ON tasks (doer_id, status);

-- ── 2. completed_at — the End Time column ───────────────────────────────────
-- Partial: a NULL completed_at means "still open", which is the majority of the
-- table and is never what an End Time sort or a "closed between X and Y" filter
-- is looking for. Indexing only the non-null rows keeps this small.
CREATE INDEX IF NOT EXISTS tasks_completed_at_idx
  ON tasks (completed_at)
  WHERE completed_at IS NOT NULL;

-- ── 3. task_time_rollup — currently has NOTHING but its primary key ─────────
-- Both columns below are read constantly but, as of today, only ever by
-- primary-key lookup or full aggregate scan — no query filters or orders by
-- them server-side yet (the Start Time column sorts client-side in TanStack).
-- They are created anyway because the rollup is small (one row per task that
-- has ever been started) so the write cost on each recompute is negligible,
-- and because any server-side sort added later would otherwise seq-scan.
-- If that trade ever stops being worth it, these two are the first to drop.
CREATE INDEX IF NOT EXISTS task_time_rollup_first_started_idx
  ON task_time_rollup (first_started_at)
  WHERE first_started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS task_time_rollup_rejections_idx
  ON task_time_rollup (rejection_count)
  WHERE rejection_count > 0;

-- ── Deliberately NOT created ────────────────────────────────────────────────
-- A (start_time, end_time) composite. Beyond the naming, the two columns live
-- in DIFFERENT TABLES — first_started_at on the rollup, completed_at on tasks —
-- so no single index can span them. The join between them is on the rollup's
-- primary key, which is already the fastest access path there is.
--
-- A standalone (created_at). The date-range + status combination the request
-- worries about is already served: tasks_archived_idx is (archived, created_at)
-- and every dashboard query filters archived = false, so the range seeks rather
-- than scans. tasks_status_created_idx covers the status-led form.
