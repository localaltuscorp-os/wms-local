-- 0212 — Attachments on a plan row (Milestone / Result / any project_node).
--
-- ADDITIVE ONLY: one new table, no change to any existing one. Nothing reads
-- it yet except the Project Module's registers, so this cannot disturb WMS,
-- /projects or the calendar.
--
-- WHY A NEW TABLE AND NOT `task_attachments`
--
-- task_attachments hangs off tasks.id, and a Milestone or a Result HAS NO TASK
-- — those levels are containers (see lib/project-plan/levels.ts: only
-- action / sub_action / sub_sub_action are executable and carry a task row).
-- Pointing container attachments at task_attachments would mean inventing a
-- placeholder task per milestone purely to hold a file, which would then leak
-- into WMS lists and onto people's calendars as work nobody is meant to do.
--
-- So: same SHAPE as task_attachments, same STORAGE (the existing private
-- Supabase `documents` bucket, under project-node-attachments/<nodeId>/), same
-- signed-URL read path. A new table, not a new storage system.
--
-- An executable row keeps using task_attachments through the task detail page;
-- this table is what the container levels use, and the two never describe the
-- same file.

CREATE TABLE IF NOT EXISTS "project_node_attachments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE mirrors task_attachments: deleting the plan row takes its
  -- attachment ROWS with it. The objects in the bucket are removed
  -- best-effort by the server action, exactly as deleteTaskAttachment does.
  "node_id"        uuid NOT NULL REFERENCES "project_nodes"("id") ON DELETE CASCADE,
  "storage_path"   text NOT NULL,
  "file_name"      text NOT NULL,
  "mime"           text,
  "size_bytes"     integer,
  -- SET NULL, not CASCADE: an employee leaving must not delete the evidence
  -- they attached to a live milestone.
  "uploaded_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

-- The register loads every attachment for a whole level in one batched query
-- and groups them by node, so (node_id, created_at) is exactly the access
-- path — and it keeps each row's files in upload order for free.
CREATE INDEX IF NOT EXISTS "project_node_attachments_node_idx"
  ON "project_node_attachments" ("node_id", "created_at");
