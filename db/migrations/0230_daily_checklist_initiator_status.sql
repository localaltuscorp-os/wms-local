-- 0230 — DAILY GOALS join the two status axes.
--
-- Manan, 2026-09-15: "in goals section there is a weekly goals and daily goals
-- please add doer and initiator status there also".
--
-- Weekly goals got both axes in 0225. Daily goals did not, and the asymmetry
-- was invisible until someone looked for the column: `daily_checklist` has
-- carried a `status` (the DOER axis) since it was created, but nothing an
-- initiator could rule with. So a commitment could report where it was and
-- never be approved, declined, held or filed.
--
--   DOER       Not Read · Not Started · Initiated · Follow Up · Need Info ·
--              Done · Abandoned            → `status`        (already present)
--   INITIATOR  Approved · Not Approved · On Hold · Archived
--                                          → `approval_status` + `archived_at`
--
-- ── WHY `archived_at` AND NOT A BOOLEAN ───────────────────────────────────
--
-- 0225 used the boolean each table already had. This table's only archive-ish
-- column is `abandoned_at`, and that is the RECYCLE BIN (migration 0186): every
-- planner read filters `abandoned_at IS NULL`, and a cancelled card lands there
-- to be restored. Wiring the initiator's Archived to it would DELETE a
-- commitment when someone meant to file it — exactly the mistake lib/status/
-- axes.ts warns about for `goals.archived` vs `goals.archived_at`.
--
-- So daily goals get their own `archived_at`, matching `goals` and
-- `weekly_goals`, where "put away" and "soft-deleted" are already two columns.
--
-- NULL IS THE CORRECT DEFAULT and a meaningful state: nobody has ruled on this
-- yet, which the control shows as "No Verdict" rather than folding into Not
-- Approved.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time. No enum values are
-- added (0225 already added `on_hold` to approval_status), so this file has
-- nothing that must run alone in its own transaction.

------------------------------------------------------------------------
-- 1. The verdict, and who made it
------------------------------------------------------------------------
-- Authorship is not optional: an initiator status with no author is an
-- assertion nobody signed, which is the gap 0225 closed for the other tables.

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 2. "Put away" — distinct from the Recycle Bin above it
------------------------------------------------------------------------

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

------------------------------------------------------------------------
-- 3. Indexes
------------------------------------------------------------------------
-- The verdict index mirrors goals_approval_status_idx / weekly_goals_…, for the
-- same reason: the initiator board groups by this column.
--
-- The archive index is PARTIAL. Almost every row is live, so an index over the
-- whole column would be one enormous all-NULL entry; `WHERE archived_at IS NOT
-- NULL` indexes only the filed ones, which is the set the Archive screen reads.

CREATE INDEX IF NOT EXISTS daily_checklist_approval_status_idx
  ON daily_checklist (approval_status);

CREATE INDEX IF NOT EXISTS daily_checklist_archived_at_idx
  ON daily_checklist (archived_at)
  WHERE archived_at IS NOT NULL;
