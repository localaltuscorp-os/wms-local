-- 0168 — Goal type taxonomy (ADDITIVE, idempotent).
--
-- Introduces the single `goal_type` taxonomy that replaces the fuzzy
-- `goals.category` + `weekly_goals.kpi` fields, on BOTH goal tables:
--   goal_type ∈ ('kpi' | 'branding' | 'strategic' | 'operational' | 'essential')
-- Spec: docs/superpowers/specs/2026-07-27-goals-module-design.md §2 / §7.
--
-- NOTHING is dropped: the legacy `goals.category` (text default 'goal') and
-- `weekly_goals.kpi` (boolean) columns are PRESERVED. `goal_type` is nullable so
-- bare selects stay safe until the migration lands, and the backfill only sets
-- rows where goal_type is still NULL.
--
-- BACKFILL MAPPING:
--   weekly_goals.kpi = true            → goal_type 'kpi'
--   weekly_goals (all other rows)      → goal_type 'operational'
--   goals.category   = 'operational'   → goal_type 'operational'
--   goals (all other scored rows)      → goal_type 'operational'
-- ('operational' is the safe Non-KPI default; admins reclassify to
--  branding/strategic/essential in the Goals board later.)

alter table goals        add column if not exists goal_type text;
alter table weekly_goals add column if not exists goal_type text;

-- weekly_goals: legacy kpi flag wins, else default to operational.
update weekly_goals
  set goal_type = case when kpi is true then 'kpi' else 'operational' end
  where goal_type is null;

-- goals: legacy 'operational' category maps straight through; every other
-- scored row also defaults to operational (safe Non-KPI default).
update goals
  set goal_type = 'operational'
  where goal_type is null;
