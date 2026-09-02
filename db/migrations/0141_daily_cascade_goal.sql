-- 0141 — Goals canvas Phase 5 (daily fold-in, design §4.4 item 5).
-- ADDITIVE + idempotent. DO NOT run against prod from a build session — apply
-- via the usual idempotent-SQL one-off BEFORE flipping GOALS_CANVAS_ON.
--
-- daily_checklist.cascade_goal_id — provenance for a CASCADE (year/quarter/
-- month, `goals` table) objective pulled onto a day's plan. Today those pulls
-- are stored standalone (title-only, plan/actions.ts `addCascadeGoalToPlan`)
-- because goal_id can only reference weekly_goals; this column keeps the link
-- so daily completion can reflect back up to the source goal and daily→parent
-- contribution math becomes possible. Weekly provenance stays on goal_id.
--
-- Every read/write of this column in app code is guarded behind the
-- GOALS_CANVAS_ON flag + a graceful fallback, so nothing breaks while this
-- migration is unapplied.

alter table daily_checklist
  add column if not exists cascade_goal_id uuid references goals(id) on delete set null;

create index if not exists daily_checklist_cascade_goal_idx
  on daily_checklist (cascade_goal_id);

-- Mirror of daily_checklist_emp_date_goal_idx for the cascade family: the same
-- cascade goal can't be pulled twice into one day (NULLs stay distinct, so
-- ad-hoc / weekly / task rows are unaffected).
create unique index if not exists daily_checklist_emp_date_cascade_goal_uq
  on daily_checklist (employee_id, plan_date, cascade_goal_id);
