-- 0227 — REPAIR: a plan task's client is its PROJECT's client, never its own name.
--
-- THE BUG. `createTasksCore` fills `tasks.client` from `tasks.title` when the
-- caller does not supply one — correct for the WMS New Task form, where the
-- first field IS the client. A task created from a plan row has the ACTION's
-- name as its title, so every action scheduled out of a project with no client
-- was filed under a client called "thin", "thesdrv", "Install readers at
-- Plant 2" — the action's own name, staring back out of the Client column.
--
-- The code no longer does this: `client` is now passed explicitly on the plan
-- path, null included, and the title fallback fires only when the caller never
-- mentioned a client at all (see lib/validators/task.ts — the `.default(null)`
-- that made those two cases indistinguishable is gone).
--
-- THIS FIXES THE ROWS ALREADY WRITTEN. Every task linked to a plan row has its
-- client recomputed from the project above it, by the same nearest-ancestor
-- rule `clientForNode` applies. A project with no client yet yields NULL, which
-- shows as "—" — the honest answer, and one that fills in by itself the moment
-- someone sets the client on the project (`resyncBranchClient`).
--
-- ONLY PLAN-LINKED TASKS ARE TOUCHED (`project_node_id IS NOT NULL`). A task
-- created in WMS keeps client = title, which is what it means there.
--
-- FULLY IDEMPOTENT — it recomputes, so re-running changes nothing.

WITH RECURSIVE up AS (
  -- Seed: every plan node, standing for itself at depth 0.
  SELECT id AS node_id, id AS cur, parent_id, client_name, 0 AS depth
    FROM project_nodes
  UNION ALL
  -- Climb: each row's parent, carrying the original node_id along.
  SELECT up.node_id, n.id, n.parent_id, n.client_name, up.depth + 1
    FROM project_nodes n
    JOIN up ON up.parent_id = n.id
),
resolved AS (
  -- The nearest ancestor (smallest depth) that actually holds a client.
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

-- And the other half: a plan task whose branch has NO client anywhere must not
-- keep the stale name it was given. Cleared to NULL rather than left, because
-- "thesdrv" is not a client and never was.
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
