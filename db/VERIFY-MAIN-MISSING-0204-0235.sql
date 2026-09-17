-- ============================================================================
--  VERIFY — read-only, ONE query (the editor only shows the last result).
--  Run BEFORE and AFTER db/RUN-IN-SUPABASE-MAIN-MISSING-0204-0235.sql.
--  After the run every row should say PASS (row 6 only if you ran PART 3).
-- ============================================================================
with
expected_tables(name) as (values ('candidate_access_links'), ('candidate_policy_signatures'), ('dcc_calendar_events'), ('dcc_call_logs'), ('dcc_master_items'), ('dcc_master_links'), ('goal_approver_statuses'), ('incentive_eligibility'), ('recruitment_jd_sends'), ('recruitment_jds'), ('weekly_goal_approver_statuses')),
expected_columns(tbl, col) as (values
    ('incentive_catalog','applies_to_all'),
    ('jd_assignments','for_dcc'),
    ('jd_assignments','for_event'),
    ('jd_assignments','for_wms'),
    ('jd_entries','category'),
    ('jd_entries','owner_employee_id'),
    ('project_nodes','approval_status'),
    ('project_nodes','progress_percent'),
    ('project_nodes','status')
),
checks(ord, check_name, ok, detail) as (
  select 1, 'Right project (about 280+ public tables)',
         (select count(*) from information_schema.tables where table_schema = 'public') > 250,
         (select count(*)::text || ' tables' from information_schema.tables where table_schema = 'public')
  union all
  select 2, 'Status values on_hold + archived exist (PART 1)',
         (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'approval_status' and e.enumlabel in ('on_hold', 'archived')) = 2,
         ''
  union all
  select 3, 'All 11 new tables exist (PART 2)',
         not exists (select 1 from expected_tables where to_regclass('public.' || name) is null),
         coalesce((select 'missing: ' || string_agg(name, ', ') from expected_tables where to_regclass('public.' || name) is null), 'none missing')
  union all
  select 4, 'All 9 new columns exist (PART 2)',
         not exists (select 1 from expected_columns c where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = c.tbl and i.column_name = c.col)),
         coalesce((select 'missing: ' || string_agg(c.tbl || '.' || c.col, ', ') from expected_columns c where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = c.tbl and i.column_name = c.col)), 'none missing')
  union all
  select 5, 'JD rank ladder is the new 26-rank ladder (0226)',
         exists (select 1 from jd_ranks where name = 'Chairman' and rank_order = 260),
         (select count(*)::text || ' active ranks' from jd_ranks where is_active)
  union all
  select 6, 'Optional: broadcasts send instant updates (PART 3)',
         exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcasts'),
         ''
)
select check_name, case when ok then 'PASS' else 'NOT YET' end as result, detail
from checks
order by ord;
