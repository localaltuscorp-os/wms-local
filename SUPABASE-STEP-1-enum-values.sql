-- ============================================================================
-- STEP 1 of 2 — ENUM VALUES.  RUN THIS FIRST, ON ITS OWN, AND LET IT COMMIT.
-- ============================================================================
--
-- Postgres will not let a new enum value be ADDED and then USED inside the same
-- transaction.  STEP 2 does use both values below (0225 sets tasks.status and
-- approval_status to them), so these two statements have to go in first, in
-- their own run.  This is the same split scripts/apply-all-migrations.ts makes
-- automatically; pasting by hand means doing it by hand.
--
-- Safe to re-run: both carry IF NOT EXISTS.
-- After this succeeds, open STEP 2.

alter type task_status add value if not exists 'abandoned';
alter type approval_status add value if not exists 'on_hold';
