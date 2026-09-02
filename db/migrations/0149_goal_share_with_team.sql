-- 0149 — Goal "Share with Team" flag. ADDITIVE + idempotent.
-- A per-goal Yes/No: when on, the goal is shared with the picked team members
-- (goals.team_involved already holds the members; goals.team_dependency_pct is
-- the team-participation %). Default off.

alter table goals
  add column if not exists share_with_team boolean not null default false;
