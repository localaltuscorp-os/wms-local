-- 0228 — THE 0227 REPAIR, RUN AGAIN.
--
-- Not a new rule and not a new bug: the SAME repair as 0227, re-applied to
-- catch the rows written in the window between them.
--
-- WHY A SECOND FILE. 0227 fixed the tasks that existed when it ran, but the
-- code that CREATED them wrongly was only fully closed afterwards. The New Item
-- dialog builds its task through the ordinary WMS path (`createTasksCore`), not
-- through `syncNodeTask`, and that path had no idea a plan row's project has a
-- client — so it kept falling back to the task's title, which for a plan task
-- is the action's own name. Any Action or Sub-Action created through the dialog
-- in that window is filed under itself.
--
-- The hole is closed at the root now: `createTasksCore` resolves the client
-- from `project_node_id` whenever the caller does not supply one, so every path
-- into it — dialog, inline "+", bulk upload, lazy sync — files a plan task
-- under its project. This is the last sweep behind that change.
--
-- Migrations run once by filename, which is why re-running 0227 is not an
-- option and this is a file of its own rather than an edit to that one.
--
-- FULLY IDEMPOTENT — it recomputes, so a database already correct is unchanged.

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

-- A plan task whose branch names no client anywhere must not keep the stale
-- name it was handed. Cleared to NULL, which reads as "—".
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
