-- Perf hardening — add indexes that the query layer assumes exist but
-- which the schema never declared. Found during the 2026-05-25 hardening
-- audit. All idempotent.
--
-- 1. tasks(due_at)
--    Used by lib/queries/admin.ts (overdueTasks count: WHERE due_at < now)
--    and the agenda board (ORDER BY due_at). Without an index this is a
--    full-table scan that gets worse linearly as the tasks table grows.
--
-- 2. tasks(approved_by_id)
--    FK to employees.id but never indexed. Joins on this column for the
--    "tasks I approved" admin filter were heap-scanning.
--
-- 3. tasks(transferred_from_id)
--    FK to employees.id; joined when rendering reassign history. Same
--    rationale as approved_by_id.
--
-- `tasks_project_node_idx` already exists from migration 0027 — not
-- re-created here. `tasks_created_by_idx` already exists from the
-- original schema. Everything else needed for the hot paths is covered
-- by the composite indexes declared in the schema.

create index if not exists tasks_due_at_idx
  on tasks(due_at);

create index if not exists tasks_approved_by_idx
  on tasks(approved_by_id);

create index if not exists tasks_transferred_from_idx
  on tasks(transferred_from_id);
