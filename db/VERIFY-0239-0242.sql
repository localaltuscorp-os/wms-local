-- ============================================================================
--  VERIFY 0239 to 0242, after db/RUN-IN-SUPABASE-0239-0242.sql.
--  Read-only. Changes NOTHING.
--
--  ONE result table, because the Supabase editor shows only the last one.
--  Every row must read ok. Any row reading MISSING means that part did not run.
-- ============================================================================

with wanted(kind, name) as (
  values
    ('column',     'dcc_entries.completed_quantity'),
    ('column',     'dcc_kpi_items.mcc_frequency'),
    ('column',     'dcc_kpi_items.mcc_days'),
    ('column',     'dcc_kpi_items.mcc_start_month'),
    ('column',     'dcc_kpi_items.minutes'),
    ('constraint', 'dcc_entries_completed_quantity_chk'),
    ('constraint', 'dcc_kpi_items_mcc_frequency_chk'),
    ('constraint', 'dcc_kpi_items_mcc_days_chk'),
    ('constraint', 'dcc_kpi_items_mcc_start_month_chk'),
    ('constraint', 'dcc_entries_doer_status_chk'),
    ('constraint', 'dcc_kpi_items_minutes_chk')
),
found as (
  select 'column' as kind, table_name || '.' || column_name as name
  from information_schema.columns
  where table_schema = 'public' and table_name in ('dcc_entries', 'dcc_kpi_items')
  union all
  select 'constraint', conname from pg_constraint
)
select w.kind, w.name, case when f.name is null then 'MISSING' else 'ok' end as result
from wanted w
left join found f on f.kind = w.kind and f.name = w.name
union all
select 'rule', 'Abandoned allowed as a Doer Status',
       case when exists (
         select 1 from pg_constraint
         where conname = 'dcc_entries_doer_status_chk'
           and pg_get_constraintdef(oid) like '%abandoned%'
       ) then 'ok' else 'MISSING' end
order by 1, 2;
