-- 0167 — Appraisal role framework (ADDITIVE, idempotent).
--
-- Reshapes Appraisal v2 to the confirmed Performance & Incentive framework:
--   • appr_config.role_class      — 'manager' | 'non-manager' (selects the
--                                    dimension set + weights from MACRO_BUCKETS).
--   • appr_config.dimension_weights default refreshed to the role-based bucket
--     keys (kpi/goals/culture/…). Legacy 6-dim rows (which carried an
--     "incentive" key) are reset to the non-manager framework defaults.
--   • appr_scorecard.kpi_actuals  — jsonb map of KPI-dictionary lineId → actual
--     (Management enters the raw actuals; the internal KPI % = incentive %).
--   • appr_dimension_score        — one Self/Manager/Management (0..100) score
--     per role dimension (goals, culture, skillUpgrade, …).
--
-- NOTHING is dropped: the old appr_kpi / appr_skill / appr_attitude /
-- appr_item_score tables and appr_scorecard.incentive_score / culture_score
-- columns are preserved (unused by the new engine).

alter table appr_config add column if not exists role_class text not null default 'non-manager';

alter table appr_config
  alter column dimension_weights set default
  '{"kpi":20,"goals":30,"culture":15,"problemSolving":10,"growthMindset":10,"attendTraining":5,"skillUpgrade":5,"teamPlayer":5}'::jsonb;

-- Refresh legacy weight maps (the old 6-dim model always carried an "incentive"
-- key) to the non-manager framework defaults so no stale weight leaks through.
update appr_config
  set dimension_weights =
    '{"kpi":20,"goals":30,"culture":15,"problemSolving":10,"growthMindset":10,"attendTraining":5,"skillUpgrade":5,"teamPlayer":5}'::jsonb
  where dimension_weights ? 'incentive';

alter table appr_scorecard add column if not exists kpi_actuals jsonb not null default '{}'::jsonb;

create table if not exists appr_dimension_score (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  dimension_key text not null,
  self_score integer,
  self_note text,
  manager_score integer,
  manager_note text,
  management_score integer,
  management_note text,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists appr_dimension_score_uq on appr_dimension_score (employee_id, dimension_key);
create index if not exists appr_dimension_score_employee_idx on appr_dimension_score (employee_id);
