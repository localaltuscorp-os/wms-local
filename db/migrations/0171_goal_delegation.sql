-- 0171 — "Delegate to team".
--
-- A goal (or a share of it) handed to a staff member for accountability. This is
-- DISTINCT from team_involved / share_with_team (participation + visibility with
-- weights): delegated_to is who is answerable for the goal, each entry carrying a
-- delegation percentage (default 100). Delegated goals surface on the delegate's
-- own board — getSharedGoals ORs this containment in alongside the share path.
--
-- Additive + nullable so bare `select()`s stay safe before the app ships. Shape:
--   [{ "employeeId": "<uuid>", "name": "Asha", "pct": 100 }, ...]
ALTER TABLE goals        ADD COLUMN IF NOT EXISTS delegated_to jsonb;
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS delegated_to jsonb;
