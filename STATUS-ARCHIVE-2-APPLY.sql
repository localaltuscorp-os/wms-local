BEGIN;

ALTER TABLE goals        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_archived_at_idx
  ON goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS weekly_goals_archived_at_idx
  ON weekly_goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;
ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_approval_status_idx
  ON goals (approval_status);
CREATE INDEX IF NOT EXISTS weekly_goals_approval_status_idx
  ON weekly_goals (approval_status);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

UPDATE tasks
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE tasks
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE weekly_goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE weekly_goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE project_nodes
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE project_nodes
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE tasks
   SET archived   = true,
       updated_at = now()
 WHERE archived = false
   AND project_node_id IN (
     SELECT id FROM project_nodes WHERE kind = 'result'
   );

WITH RECURSIVE up AS (
  SELECT id AS node_id, id AS cur, parent_id, client_name, 0 AS depth
    FROM project_nodes
  UNION ALL
  SELECT up.node_id, n.id, n.parent_id, n.client_name, up.depth + 1
    FROM project_nodes n
    JOIN up ON up.parent_id = n.id
),
resolved AS (
  SELECT DISTINCT ON (node_id) node_id, client_name
    FROM up
   WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
   ORDER BY node_id, depth ASC
)
UPDATE tasks t
   SET client     = r.client_name,
       updated_at = now()
  FROM resolved r
 WHERE t.project_node_id = r.node_id
   AND t.client IS DISTINCT FROM r.client_name;

UPDATE tasks t
   SET client     = NULL,
       updated_at = now()
 WHERE t.project_node_id IS NOT NULL
   AND t.client IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM project_nodes p
      WHERE p.id = t.project_node_id
        AND EXISTS (
          WITH RECURSIVE chain AS (
            SELECT id, parent_id, client_name FROM project_nodes WHERE id = p.id
            UNION ALL
            SELECT n.id, n.parent_id, n.client_name
              FROM project_nodes n JOIN chain c ON c.parent_id = n.id
          )
          SELECT 1 FROM chain
           WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
        )
   );

WITH RECURSIVE up AS (
  SELECT id AS node_id, id AS cur, parent_id, client_name, 0 AS depth
    FROM project_nodes
  UNION ALL
  SELECT up.node_id, n.id, n.parent_id, n.client_name, up.depth + 1
    FROM project_nodes n
    JOIN up ON up.parent_id = n.id
),
resolved AS (
  SELECT DISTINCT ON (node_id) node_id, client_name
    FROM up
   WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
   ORDER BY node_id, depth ASC
)
UPDATE tasks t
   SET client     = r.client_name,
       updated_at = now()
  FROM resolved r
 WHERE t.project_node_id = r.node_id
   AND t.client IS DISTINCT FROM r.client_name;

UPDATE tasks t
   SET client     = NULL,
       updated_at = now()
 WHERE t.project_node_id IS NOT NULL
   AND t.client IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM project_nodes p
      WHERE p.id = t.project_node_id
        AND EXISTS (
          WITH RECURSIVE chain AS (
            SELECT id, parent_id, client_name FROM project_nodes WHERE id = p.id
            UNION ALL
            SELECT n.id, n.parent_id, n.client_name
              FROM project_nodes n JOIN chain c ON c.parent_id = n.id
          )
          SELECT 1 FROM chain
           WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
        )
   );

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_status approval_status;
ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;
ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS daily_checklist_approval_status_idx
  ON daily_checklist (approval_status);

CREATE INDEX IF NOT EXISTS daily_checklist_archived_at_idx
  ON daily_checklist (archived_at)
  WHERE archived_at IS NOT NULL;

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS pms_monthly_review_archived_idx
  ON pms_monthly_review (archived)
  WHERE archived = true;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived boolean NOT NULL DEFAULT false;
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived_at timestamptz;

CREATE INDEX IF NOT EXISTS employees_performance_archived_idx
  ON employees (performance_archived)
  WHERE performance_archived = true;

COMMIT;
