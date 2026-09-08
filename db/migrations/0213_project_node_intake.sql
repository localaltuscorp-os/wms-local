-- 0213 — Project Plan: the intake fields the full "New Task" form collects.
--
-- ADDITIVE ONLY. Every column is nullable with no default, so this is a
-- metadata-only change on modern Postgres: it rewrites zero rows and takes only
-- a brief ACCESS EXCLUSIVE lock to update the catalogue.
--
-- WHY THESE EXIST
--
-- The four create buttons on the Project screen (+ Project · + Milestone ·
-- + Result · + Action) now all open the SAME form the app-wide red "+" opens —
-- the real WMS new-task form, with client, subject, initiator, priority, due
-- date, description, notes and tags.
--
-- An ACTION already had somewhere to put all of that: it becomes a real task,
-- and tasks.* owns those columns. A CONTAINER row (project / milestone /
-- result) has no task — `syncNodeTask` returns early for them on purpose, and
-- a milestone is not something anyone "does" — so without these five columns
-- the container path would collect six fields and throw them away.
--
-- NOT DUPLICATED HERE (already on project_nodes):
--   name          the form's own title line        (migration 0027)
--   description   Task Description                 (#13)
--   notes         Initiator Notes + the Links block(#13)
--   owner_id      the FIRST doer                   (#13)
--   target_date   Due Date                         (#13)
--   starts_at     Schedule → start   (Result only) (migration 0203)
--   ends_at       Schedule → end     (Result only) (migration 0203)
--
-- Project and Milestone deliberately have NO schedule in the form, so their
-- starts_at / ends_at stay null from this path — those two levels are dated by
-- the work underneath them, not by a block someone drew on a calendar.

ALTER TABLE "project_nodes"
  -- "Client Name" — the form's first field. Plain text mirroring tasks.title,
  -- which is itself the client name in WMS (the roster lives in a separate
  -- table and is offered as suggestions, never enforced as a foreign key).
  ADD COLUMN IF NOT EXISTS "client_name"  text,
  -- Free text for the same reason: the subject roster is a suggestion list.
  ADD COLUMN IF NOT EXISTS "subject"      text,
  -- One of TASK_PRIORITIES (db/enums.ts). Plain text, matching the `kind` and
  -- `status` columns' choice — an enum would need a lock plus a follow-up
  -- migration every time a priority is added, and the app-side zod enum in
  -- app/(app)/project-plan/actions.ts is what actually validates writes.
  ADD COLUMN IF NOT EXISTS "priority"     text,
  -- Who asked for it. ON DELETE SET NULL, exactly like owner_id: retiring an
  -- employee must never delete project structure.
  ADD COLUMN IF NOT EXISTS "initiator_id" uuid
    REFERENCES "employees"("id") ON DELETE SET NULL,
  -- Free-form chips, same shape as tasks.tags.
  ADD COLUMN IF NOT EXISTS "tags"         text[];
