-- 0203 — Project Plan hierarchy screen (Project → Milestone → Result → Action
-- → Sub-Action → Sub-Sub-Action).
--
-- ADDITIVE ONLY. Every column is nullable with no default, so this is a
-- metadata-only change on modern Postgres and rewrites zero rows. The existing
-- /projects workspace reads none of these columns and is unaffected.
--
-- NOTE ON `kind`: project_nodes.kind is plain `text` (migration 0027) with NO
-- check constraint, so the new 'sub_sub_action' level needs no DDL — only the
-- app-side zod enum and the TS union widen. Deliberately left as text rather
-- than promoted to an enum here: an enum would need a lock + a follow-up
-- migration every time a level is added.

ALTER TABLE "project_nodes"
  -- The plan columns the hierarchy table edits inline. For an executable row
  -- (action / sub_action / sub_sub_action) these are the PLAN of record and are
  -- pushed onto the linked WMS task (tasks.project_node_id), which stays the
  -- single execution record shared with WMS + Google Calendar. For container
  -- rows (project / milestone / result) they are plan metadata only.
  ADD COLUMN IF NOT EXISTS "category"         text,
  ADD COLUMN IF NOT EXISTS "purpose"          text,
  -- Duration in whole minutes ("2 h 30 m" → 150). Minutes, not an interval:
  -- tasks.estimated_minutes is already an integer-minutes column and these two
  -- are mirrored on every write, so the units must match exactly.
  ADD COLUMN IF NOT EXISTS "duration_minutes" integer,
  -- FROM / TO — the scheduled block. Mirrored onto tasks.starts_at / ends_at,
  -- which is what lib/google/calendar.ts already turns into a timed event
  -- (falling back to an all-day event on the due date when starts_at is null).
  ADD COLUMN IF NOT EXISTS "starts_at"        timestamptz,
  ADD COLUMN IF NOT EXISTS "ends_at"          timestamptz;

-- The hierarchy table always loads a whole project at once and orders siblings
-- by (parent, sort_order). The existing project_nodes_parent_idx covers the
-- lookup but not the ordering, so sibling ordering falls back to a sort on
-- every expand. Cheap covering index; the table is small.
CREATE INDEX IF NOT EXISTS "project_nodes_parent_sort_idx"
  ON "project_nodes" ("parent_id", "sort_order");
