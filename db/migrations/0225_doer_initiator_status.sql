-- 0225 — THE TWO STATUS AXES: doer status and initiator status.
--
-- Manan, 2026-09-14. Every row of work is described twice: the doer reports
-- where it is, the initiator rules what to do about it. Those two answers were
-- tangled together — `on_hold` was a DOER value on tasks and an INITIATOR value
-- on project nodes, and goals had no initiator axis at all.
--
-- After this migration, in every module:
--
--   DOER       Not Read · Not Started · Initiated · Follow Up · Need Info ·
--              Done · Abandoned            → `status`
--   INITIATOR  Approved · Not Approved · On Hold · Archived
--                                          → `approval_status` + `archived`
--
-- Archived stays the BOOLEAN each table already has. It has a filter and an
-- index; a second string saying "archived" beside a boolean saying false is a
-- bug waiting to happen. See lib/status/axes.ts.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The two new enum values
------------------------------------------------------------------------
-- Split out on their own because a new enum value cannot be referenced in the
-- transaction that adds it. Both runners (scripts/apply-all-migrations.ts and
-- scripts/dummy-db-setup.ts) lift `alter type ... add value` lines out and run
-- them alone, which is why these sit on one line each.

alter type task_status add value if not exists 'abandoned';
alter type approval_status add value if not exists 'on_hold';

------------------------------------------------------------------------
-- 2. Goals grow an initiator axis
------------------------------------------------------------------------
-- Neither table had one. NULL is the correct default and a meaningful state:
-- "nobody has ruled on this yet", which the board shows as its own No Verdict
-- column rather than folding it into Not Approved.

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

-- Who ruled, and when. Without these an initiator status is an assertion with
-- no author — the same gap 0215 closed for device revocation.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_approval_status_idx
  ON goals (approval_status);
CREATE INDEX IF NOT EXISTS weekly_goals_approval_status_idx
  ON weekly_goals (approval_status);

------------------------------------------------------------------------
-- 3. Tasks: the same authorship columns
------------------------------------------------------------------------
-- `tasks.approval_status` already existed; who set it did not.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 4. Project nodes: authorship too
------------------------------------------------------------------------
-- `project_nodes.approval_status` is TEXT (it pre-dates the shared enum and
-- carries container rows that never had a task), so there is no type change
-- here — only the missing authorship.

ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 5. Move every held task onto the initiator axis
------------------------------------------------------------------------
-- Safe to run here even though section 1 added the value: the runners lift
-- `alter type ... add value` out and commit it in its own transaction BEFORE
-- this block, which is the whole reason they do that.
--
-- THE DOER STATUS WE LEAVE BEHIND. A held row's `status` has to become
-- something, and the row does not record what it was before someone held it.
-- `initiated` is the honest guess — work is put on hold because it had started
-- and then had to stop; a task nobody had opened would have been archived, not
-- held. Only rows with no verdict yet are touched, so an existing ruling is
-- never overwritten by this guess.

UPDATE tasks
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

-- A held task that ALREADY carried a verdict keeps the verdict; only its doer
-- status moves off the retired value, so it stops rendering as a deprecated
-- status in pickers that filter them out.
UPDATE tasks
   SET status = 'initiated'
 WHERE status = 'on_hold';

-- Goals and weekly goals share the task_status enum and so could hold the same
-- retired value. Same treatment, same reasoning.
UPDATE goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE weekly_goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE weekly_goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

-- Project nodes already treated on_hold as an initiator verdict, so a container
-- holding it in `status` is the drift this migration exists to end.
UPDATE project_nodes
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE project_nodes
   SET status = 'initiated'
 WHERE status = 'on_hold';
