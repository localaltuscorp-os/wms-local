-- 0204 — Project Module: status, approval verdict and partial progress.
--
-- ADDITIVE ONLY. All three columns are nullable with no default, so this is a
-- metadata-only change on modern Postgres: it rewrites zero rows and takes only
-- a brief ACCESS EXCLUSIVE lock to update the catalogue.
--
-- WHY THESE THREE AND NOTHING ELSE
--
-- The brief asks for Project No, Name, Description, Status, Start Date, End
-- Date, Duration (days), Progress and Milestone completion. Most of that is
-- already on the table and is deliberately NOT duplicated here:
--
--   Project No       DERIVED from sibling position (lib/project-plan/levels.ts
--                    refFor / fullRefFor). Never stored — a stored label drifts
--                    from the tree the first time a row is deleted.
--   Name             project_nodes.name          (migration 0027)
--   Description      project_nodes.description   (#13)
--   Start Date       project_nodes.starts_at     (migration 0203)
--   End Date         project_nodes.ends_at       (migration 0203)
--   Duration (days)  DERIVED from starts_at → ends_at. Storing it would let it
--                    disagree with its own two endpoints.
--   Progress %       DERIVED from milestone completion, except where a person
--                    has recorded a partial — that is `progress_percent` below.
--   Archived         project_nodes.is_archived   (existing boolean + index)
--
-- On an EXECUTABLE row (action / sub_action / sub_sub_action) the status of
-- record stays on the linked WMS task (tasks.status), exactly as it is today —
-- those rows are one shared record with WMS and the calendar, and a second
-- status column on the node would be a copy free to disagree with it. The two
-- columns below therefore describe CONTAINER rows (project / milestone /
-- result), which have no task to carry a status.

ALTER TABLE "project_nodes"
  -- The WORKING flow — the same six values as DOER_TASK_STATUSES in db/enums.ts
  -- ('dont_know' displays as "Not Read"). Plain text, matching the existing
  -- `kind` column's choice: an enum would need a lock plus a follow-up
  -- migration every time a status is added, and the app-side zod enum in
  -- lib/project-plan/status.ts is what actually validates writes.
  ADD COLUMN IF NOT EXISTS "status" text,

  -- The RESTRICTED flow — not_approved / approved / on_hold / cancelled.
  -- Separate from `status` on purpose, mirroring what tasks.approval_status
  -- already does: a verdict is layered ON TOP of a progress report rather than
  -- overwriting it, so "approved" does not erase the fact that the work was
  -- at Follow Up when it was approved.
  --
  -- 'archived' from the brief's restricted list is NOT a value here — archiving
  -- is project_nodes.is_archived, which already has a column, an index and a
  -- filter on every read. A parallel status string could disagree with it.
  ADD COLUMN IF NOT EXISTS "approval_status" text,

  -- Recorded partial completion, 0–100, for ONE milestone (or any container).
  -- NULL means "derive it from the executable rows underneath" — which is the
  -- normal case. A number here is a human overruling the derived figure, and
  -- lib/project-plan/progress.ts honours it over the derivation.
  --
  -- integer, not numeric: the input is whole percents (40%, 75%), and the
  -- DECIMAL part of the brief is in the ROLLUP (3.5/10), which is computed, not
  -- stored. 10 milestones at whole percents still sum to 3.5.
  ADD COLUMN IF NOT EXISTS "progress_percent" integer;

-- Guard the two vocabularies at the database, not only in zod. A bad write from
-- a script or a psql session must fail here rather than leave a row the app
-- cannot render. NOT VALID: the check applies to every new and updated row
-- immediately but does not scan the existing table, so this stays a fast
-- metadata-only change. Existing rows are all NULL in these columns anyway —
-- they were created by this migration.
ALTER TABLE "project_nodes"
  DROP CONSTRAINT IF EXISTS "project_nodes_status_check";
ALTER TABLE "project_nodes"
  ADD CONSTRAINT "project_nodes_status_check"
  CHECK (
    "status" IS NULL OR "status" IN (
      'dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'
    )
  ) NOT VALID;

ALTER TABLE "project_nodes"
  DROP CONSTRAINT IF EXISTS "project_nodes_approval_status_check";
ALTER TABLE "project_nodes"
  ADD CONSTRAINT "project_nodes_approval_status_check"
  CHECK (
    "approval_status" IS NULL OR "approval_status" IN (
      'not_approved', 'approved', 'on_hold', 'cancelled'
    )
  ) NOT VALID;

ALTER TABLE "project_nodes"
  DROP CONSTRAINT IF EXISTS "project_nodes_progress_percent_check";
ALTER TABLE "project_nodes"
  ADD CONSTRAINT "project_nodes_progress_percent_check"
  CHECK ("progress_percent" IS NULL OR ("progress_percent" >= 0 AND "progress_percent" <= 100))
  NOT VALID;

-- The Projects list filters to kind='project' and orders by sort_order. The
-- existing project_nodes_kind_idx covers (kind, is_archived); this adds the
-- ordering so the top-level list needs no sort. Cheap; the table is small.
CREATE INDEX IF NOT EXISTS "project_nodes_kind_sort_idx"
  ON "project_nodes" ("kind", "is_archived", "sort_order");
