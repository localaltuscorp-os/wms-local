-- 0226 — A RESULT IS NOT A TASK.
--
-- Manan, 2026-09-14: "only action and sub action will go to task section".
--
-- Result used to be in TASK_KINDS (lib/project-plan/levels.ts) on the opposite
-- request — someone put an owner and a date on a Result and expected to find it
-- in WMS. What settled it the other way is that a Result's PROGRESS is counted
-- from the actions underneath it, so a task of its own put a second,
-- self-reported answer beside a derived one, and put a row in the task list
-- that nobody actually does.
--
-- The code stops creating them. This archives the ones already there.
--
-- ARCHIVED, NOT DELETED. These tasks may carry logged time, comments and
-- history, and a Result that was being worked as a task is a real record of
-- what happened. `archived = true` takes them out of the task list and off the
-- calendar (the app's own archive semantics) and leaves every row intact — so
-- if this turns out to be the wrong call, it is one UPDATE to reverse.
--
-- The plan rows themselves are untouched: a Result keeps its owner, its target
-- date and its derived progress exactly as before. Only its WMS twin goes.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

UPDATE tasks
   SET archived   = true,
       updated_at = now()
 WHERE archived = false
   AND project_node_id IN (
     SELECT id FROM project_nodes WHERE kind = 'result'
   );

-- The linked tasks are archived, not unlinked: `project_node_id` is what tells
-- the plan row it once had one, and clearing it would strand the task with no
-- way back to the Result it came from. `syncNodeTask` refuses to touch a row
-- whose kind is no longer in TASK_KINDS, so nothing will resurrect them.
