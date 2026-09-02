-- 0070_goal_task_link — Phase 2 (Goal↔Task linkage). Idempotent + additive.
-- One Weekly Goal ⇄ one Task. Both FKs ON DELETE SET NULL so deleting either
-- side never cascades into the other. See lib/weekly-goals/task-sync.ts.

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS task_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_goals_task_id_fkey'
  ) THEN
    ALTER TABLE weekly_goals
      ADD CONSTRAINT weekly_goals_task_id_fkey
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS weekly_goals_task_id_idx ON weekly_goals(task_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS origin_goal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_origin_goal_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_origin_goal_id_fkey
      FOREIGN KEY (origin_goal_id) REFERENCES weekly_goals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_origin_goal_idx ON tasks(origin_goal_id);
