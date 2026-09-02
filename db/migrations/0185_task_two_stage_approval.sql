-- 0185 — TWO-STAGE TASK APPROVAL (Sir, 2026-08).
--
-- "In Kanban create Manager Approved and Admin Approved as separate categories.
--  Managers can approve tasks given by Admin or Manager, but Admin Approval can
--  only be given by Manan Sir. Currently whatever is recorded as Approved is
--  Admin Approved."
--
-- DESIGN — one `approval_level` column, NOT two new task_status values.
-- `tasks.status = 'approved'` keeps its meaning ("signed off at manager level or
-- higher"), so the ~40 existing consumers of approved-ness keep working
-- untouched. The two Kanban columns are SYNTHETIC, derived from the level —
-- exactly the pattern `__archived__` already uses to render a column backed by
-- `tasks.archived` rather than a status.
--
-- FULLY IDEMPOTENT — the drizzle journal is out of sync in this repo, so this is
-- applied directly via scripts/apply-0185-two-stage-approval.ts.

-- ── 1. The level ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_level') THEN
    CREATE TYPE approval_level AS ENUM ('none', 'manager', 'admin');
  END IF;
END $$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_level approval_level NOT NULL DEFAULT 'none',
  -- Per-stage audit. Who signed off at each level, when, and with what note —
  -- kept separate so a manager sign-off is never overwritten by the admin one.
  ADD COLUMN IF NOT EXISTS manager_approved_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS manager_approval_note  text,
  ADD COLUMN IF NOT EXISTS admin_approved_by_id   uuid REFERENCES employees (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS admin_approval_note    text;

CREATE INDEX IF NOT EXISTS tasks_approval_level_idx ON tasks (approval_level);

-- ── 2. Backfill — everything already approved is ADMIN approved ─────────────
-- Sir: "Currently whatever is recorded as Approved is Admin Approved."
--
-- Scoped deliberately: the time-panel writes `approval_status='approved'` with
-- NO status gate, so a PENDING task can carry that verdict. Sweeping on
-- approval_status alone would drag pending-lane work into ADMIN APPROVED, so the
-- predicate requires the task to actually be done/approved.
UPDATE tasks
   SET approval_level      = 'admin',
       admin_approved_by_id = COALESCE(admin_approved_by_id, approved_by_id),
       admin_approved_at    = COALESCE(admin_approved_at, approved_at, completed_at, updated_at),
       admin_approval_note  = COALESCE(admin_approval_note, approval_note)
 WHERE approval_level = 'none'
   AND (status = 'approved' OR (approval_status = 'approved' AND status IN ('done', 'approved')));
-- manager_approved_* stays NULL on purpose: that history has no manager stage,
-- and inventing one would fabricate an audit record.

-- ── 3. Invariant ────────────────────────────────────────────────────────────
-- A level above 'none' only makes sense on a task that reached approval.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_approval_level_needs_status'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_approval_level_needs_status
      CHECK (approval_level = 'none' OR status = 'approved') NOT VALID;
  END IF;
END $$;
