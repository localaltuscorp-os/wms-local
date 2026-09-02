-- 0144 — Goals canvas Phase 4 (cross-level move, all five levels).
-- ADDITIVE + idempotent. WRITTEN, NOT APPLIED — apply via the usual idempotent
-- one-off SQL BEFORE flipping GOALS_CANVAS_ON (never from a build session).
--
-- weekly_goals.converted_from_goal_id — provenance for a cascade goal (year/
-- quarter/month, `goals` table) CONVERTED into a weekly leaf by
-- `convertGoalToWeekly` (goals/cascade/actions.ts): the source `goals` row is
-- soft-archived and this column links the new weekly row back to it. The
-- existing `carried_from_id` can't hold the link — it FKs weekly_goals(id)
-- (migration 0065) and drives the "carried in" badge/idempotency checks.
-- (Daily conversions need no new column: daily_checklist.cascade_goal_id from
-- migration 0141 already carries goal-table provenance.)
--
-- ⚠ This column is DELIBERATELY NOT declared in db/schema.ts: weekly_goals has
-- many bare .select()/.returning() call sites and drizzle enumerates every
-- declared column, so declaring an unapplied column would break every weekly
-- read in prod. The single write is guarded raw SQL in convertGoalToWeekly
-- that silently no-ops while this migration is unapplied (the activity log
-- keeps the provenance trail meanwhile). Declare it in schema.ts only AFTER
-- this migration is applied.

alter table weekly_goals
  add column if not exists converted_from_goal_id uuid references goals(id) on delete set null;

create index if not exists weekly_goals_converted_from_goal_idx
  on weekly_goals (converted_from_goal_id);
