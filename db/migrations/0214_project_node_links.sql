-- 0214 — Project Plan: reference links on a plan row.
--
-- ADDITIVE ONLY. One nullable column with no default: a metadata-only change
-- that rewrites zero rows.
--
-- WHY A COLUMN AND NOT THE NOTES BLOCK
--
-- The WMS task form has always folded its Links section into the notes text
-- ("Links:\n- https://…"), because a task had no column for them and notes
-- survive to the task record. That is fine for prose a person reads, and wrong
-- for a REGISTER COLUMN: rendering a Links cell would mean parsing a marker out
-- of free text on every row, and a note that happens to contain the word
-- "Links:" would sprout links nobody added.
--
-- So the plan row keeps its own list. It is written by the same form for EVERY
-- level — a container through `createPlanContainer`, an action through
-- `createPlanNodeForTask` — which is what lets the register read one field and
-- render the same cell on all four registers.
--
-- READ DEFENSIVELY. Like the 0204 columns, this is fetched in its own
-- round-trip (`loadPlanLinks` in lib/queries/project-plan.ts) whose failure is
-- caught, so a database without 0214 loses the Links column and nothing else.

ALTER TABLE "project_nodes"
  ADD COLUMN IF NOT EXISTS "links" text[];
