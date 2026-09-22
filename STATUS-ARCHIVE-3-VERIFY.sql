WITH RECURSIVE expected_columns (grp, tbl, col) AS (
  VALUES
    (1, 'goals',              'archived_at'),
    (1, 'goals',              'approval_status'),
    (1, 'goals',              'approval_by_id'),
    (1, 'goals',              'approval_at'),
    (1, 'weekly_goals',       'archived_at'),
    (1, 'weekly_goals',       'approval_status'),
    (1, 'weekly_goals',       'approval_by_id'),
    (1, 'weekly_goals',       'approval_at'),
    (1, 'tasks',              'approval_by_id'),
    (1, 'tasks',              'approval_at'),
    (1, 'project_nodes',      'approval_by_id'),
    (1, 'project_nodes',      'approval_at'),
    (1, 'daily_checklist',    'approval_status'),
    (1, 'daily_checklist',    'approval_by_id'),
    (1, 'daily_checklist',    'approval_at'),
    (1, 'daily_checklist',    'archived_at'),
    (1, 'pms_monthly_review', 'archived'),
    (1, 'pms_monthly_review', 'archived_at'),
    (1, 'employees',          'performance_archived'),
    (1, 'employees',          'performance_archived_at')
),
expected_indexes (grp, idx) AS (
  VALUES
    (3, 'goals_archived_at_idx'),
    (3, 'weekly_goals_archived_at_idx'),
    (3, 'goals_approval_status_idx'),
    (3, 'weekly_goals_approval_status_idx'),
    (3, 'daily_checklist_approval_status_idx'),
    (3, 'daily_checklist_archived_at_idx'),
    (3, 'pms_monthly_review_archived_idx'),
    (3, 'employees_performance_archived_idx')
),
up AS (
  SELECT id AS node_id, parent_id, client_name, 0 AS depth
    FROM project_nodes
  UNION ALL
  SELECT up.node_id, n.parent_id, n.client_name, up.depth + 1
    FROM project_nodes n
    JOIN up ON up.parent_id = n.id
),
resolved AS (
  SELECT DISTINCT ON (node_id) node_id, client_name
    FROM up
   WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
   ORDER BY node_id, depth ASC
),
counts AS (
  SELECT
    (SELECT count(*) FROM tasks         WHERE status = 'on_hold')                     AS tasks_on_hold,
    (SELECT count(*) FROM goals         WHERE status = 'on_hold')                     AS goals_on_hold,
    (SELECT count(*) FROM weekly_goals  WHERE status = 'on_hold')                     AS weekly_on_hold,
    (SELECT count(*) FROM project_nodes WHERE status = 'on_hold')                     AS nodes_on_hold,
    (SELECT count(*) FROM tasks t
       JOIN project_nodes p ON p.id = t.project_node_id
      WHERE p.kind = 'result' AND t.archived = false)                                 AS live_result_tasks,
    (SELECT count(*) FROM tasks t
       JOIN resolved r ON r.node_id = t.project_node_id
      WHERE t.client IS DISTINCT FROM r.client_name)                                  AS client_drift,
    (SELECT count(*) FROM tasks t
      WHERE t.project_node_id IS NOT NULL
        AND t.client IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM resolved r WHERE r.node_id = t.project_node_id)) AS stale_client
),
report AS (
  SELECT ec.grp,
         'column'::text AS kind,
         (ec.tbl || '.' || ec.col)::text AS object,
         (CASE WHEN c.column_name IS NULL THEN 'FAIL' ELSE 'PASS' END)::text AS result,
         (COALESCE(c.data_type, 'column not found')
            || CASE WHEN c.column_name IS NULL THEN ''
                    ELSE ', nullable=' || c.is_nullable
                         || COALESCE(', default=' || c.column_default, '') END)::text AS detail
    FROM expected_columns ec
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name   = ec.tbl
     AND c.column_name  = ec.col

  UNION ALL

  SELECT 2,
         'enum value'::text,
         'task_status.abandoned'::text,
         (CASE WHEN EXISTS (
            SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
             WHERE t.typname = 'task_status' AND e.enumlabel = 'abandoned'
          ) THEN 'PASS' ELSE 'FAIL' END)::text,
         'run file 1 on its own if this fails'::text

  UNION ALL

  SELECT 2,
         'enum value'::text,
         'approval_status.on_hold'::text,
         (CASE WHEN EXISTS (
            SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
             WHERE t.typname = 'approval_status' AND e.enumlabel = 'on_hold'
          ) THEN 'PASS' ELSE 'FAIL' END)::text,
         'run file 1 on its own if this fails'::text

  UNION ALL

  SELECT ei.grp,
         'index'::text,
         ei.idx::text,
         (CASE WHEN x.indexname IS NULL THEN 'FAIL' ELSE 'PASS' END)::text,
         (COALESCE(x.tablename, 'index not found'))::text
    FROM expected_indexes ei
    LEFT JOIN pg_indexes x
      ON x.schemaname = 'public' AND x.indexname = ei.idx

  UNION ALL

  SELECT 4, 'data repair'::text, 'tasks: no doer status still on_hold'::text,
         (CASE WHEN c.tasks_on_hold = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.tasks_on_hold)::text FROM counts c
  UNION ALL
  SELECT 4, 'data repair'::text, 'goals: no doer status still on_hold'::text,
         (CASE WHEN c.goals_on_hold = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.goals_on_hold)::text FROM counts c
  UNION ALL
  SELECT 4, 'data repair'::text, 'weekly_goals: no doer status still on_hold'::text,
         (CASE WHEN c.weekly_on_hold = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.weekly_on_hold)::text FROM counts c
  UNION ALL
  SELECT 4, 'data repair'::text, 'project_nodes: no doer status still on_hold'::text,
         (CASE WHEN c.nodes_on_hold = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.nodes_on_hold)::text FROM counts c
  UNION ALL
  SELECT 4, 'data repair'::text, '0226: no live task on a Result node'::text,
         (CASE WHEN c.live_result_tasks = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.live_result_tasks)::text FROM counts c
  UNION ALL
  SELECT 4, 'data repair'::text, '0227/0228: plan task client matches its project'::text,
         (CASE WHEN c.client_drift = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.client_drift)::text FROM counts c
  UNION ALL
  SELECT 4, 'data repair'::text, '0227/0228: no stale client on a clientless branch'::text,
         (CASE WHEN c.stale_client = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
         ('rows remaining: ' || c.stale_client)::text FROM counts c
)
SELECT kind, object, result, detail
  FROM report
 ORDER BY CASE result WHEN 'FAIL' THEN 0 ELSE 1 END, grp, object;
