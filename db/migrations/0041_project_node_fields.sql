-- Project module overhaul (#13). All idempotent so it's safe to re-run.
--   - notes / description: rich text for milestones, results, etc.
--   - target_date: when a node should be completed by.
--   - owner_id: the person accountable for the node.
--   - project_members: team members involved in a node (join table).

ALTER TABLE "project_nodes" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "project_nodes" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "project_nodes" ADD COLUMN IF NOT EXISTS "target_date" timestamptz;
ALTER TABLE "project_nodes" ADD COLUMN IF NOT EXISTS "owner_id" uuid;

DO $$ BEGIN
  ALTER TABLE "project_nodes"
    ADD CONSTRAINT "project_nodes_owner_id_employees_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "project_members" (
  "project_node_id" uuid NOT NULL REFERENCES "project_nodes"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("project_node_id", "employee_id")
);
