-- Tier-3 (2026-05-20) — Manan's WhatsApp spec rewrite.
--
-- 1) Additive expansion of the task_status enum: need_info, follow_up_1/2/3.
--    Postgres requires each ADD VALUE to run *outside* a transaction, so we
--    use IF NOT EXISTS guards and individual statements.
--
-- 2) New approval_status enum (approved | not_approved | cancelled | transferred)
--    and a nullable approval_status column on tasks. The legacy values of the
--    same name remain in task_status for the 240 imported rows; new code
--    should write the approval_status column instead.
--
-- 3) New columns on tasks: tags (text[]) and revised_target_date (timestamptz).
--
-- 4) Update the partial index that excludes terminal rows so the new
--    "follow_up_*" + "need_info" statuses still count as pending.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'need_info';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'follow_up_1';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'follow_up_2';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'follow_up_3';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM (
      'approved',
      'not_approved',
      'cancelled',
      'transferred'
    );
  END IF;
END$$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS tags                text[],
  ADD COLUMN IF NOT EXISTS approval_status     approval_status,
  ADD COLUMN IF NOT EXISTS revised_target_date timestamp with time zone;

CREATE INDEX IF NOT EXISTS tasks_approval_status_idx
  ON tasks (approval_status);

-- Recreate the pending-tasks partial index so the new status values count
-- as pending (drop+create because Postgres can't ALTER an index predicate).
DROP INDEX IF EXISTS tasks_pending_created_idx;
CREATE INDEX tasks_pending_created_idx ON tasks (created_at)
  WHERE status IN (
    'not_started',
    'initiated',
    'follow_up',
    'need_help',
    'need_info',
    'follow_up_1',
    'follow_up_2',
    'follow_up_3'
  );
