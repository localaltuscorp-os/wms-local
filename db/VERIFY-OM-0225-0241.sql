-- ============================================================================
--  PART 2 — VERIFY Om's migrations (0225–0232, 0234, 0240, 0241). Read-only.
--
--  Run after PART 1. Every row must say PASS, and the HR count at the bottom
--  must be no lower than the one PART 0 showed. If anything is off, send the
--  whole result to Claude before main is pushed.
-- ============================================================================

with col(t, c) as (
  select table_name, column_name from information_schema.columns where table_schema = 'public'
),
fk_target(conname, target) as (
  select c.conname, t.relname from pg_constraint c join pg_class t on t.oid = c.confrelid
   where c.contype = 'f'
)
select check_name, detail, case when ok then 'PASS' else 'FAIL' end as result
from (values

  -- ── 0225 employee master ────────────────────────────────────────────────
  ('0225  functions, shift_types, employee_code_registry exist', '',
   to_regclass('public.functions') is not null
   and to_regclass('public.shift_types') is not null
   and to_regclass('public.employee_code_registry') is not null),
  ('0225  employees: code, function, shift, team lead, train pass', '',
   (select count(*) from col where t = 'employees'
     and c in ('employee_code','function_id','shift_type_id','is_team_lead','train_pass')) = 5),
  ('0225  employee codes unique ignoring case', '',
   to_regclass('public.employees_employee_code_uq') is not null),

  -- ── 0226 billing master ─────────────────────────────────────────────────
  ('0226  billing_entity_files and billing_entity_versions exist', '',
   to_regclass('public.billing_entity_files') is not null
   and to_regclass('public.billing_entity_versions') is not null),

  -- ── 0227 entity code prefixes ───────────────────────────────────────────
  ('0227  paying_entities.code_prefix exists and is unique', '',
   exists (select 1 from col where t = 'paying_entities' and c = 'code_prefix')
   and to_regclass('public.paying_entities_code_prefix_uq') is not null),

  -- ── 0228 schedule settings ──────────────────────────────────────────────
  ('0228  employees: Saturdays 1-5, Saturday hours, WFH, attendance-applicable', '',
   (select count(*) from col where t = 'employees'
     and c in ('attendance_applicable',
               'sat1_working','sat2_working','sat3_working','sat4_working','sat5_working',
               'sat_official_start','sat_official_end',
               'wfh_full_time_allowed','wfh_part_time_allowed')) = 10),

  -- ── 0229 / 0230 incentive requests ──────────────────────────────────────
  ('0229  incentive_requests.split exists', '',
   exists (select 1 from col where t = 'incentive_requests' and c = 'split')),
  ('0230  submissions and decisions tables exist', '',
   to_regclass('public.incentive_request_submissions') is not null
   and to_regclass('public.incentive_request_decisions') is not null),
  ('0230  every existing request has its first submission', '',
   not exists (select 1 from incentive_requests r
                where not exists (select 1 from incentive_request_submissions s where s.request_id = r.id))),

  -- ── 0231 / 0232 incentive catalog ───────────────────────────────────────
  ('0231  catalog events and notification deliveries exist', '',
   to_regclass('public.incentive_catalog_events') is not null
   and to_regclass('public.incentive_notification_deliveries') is not null),
  ('0232  catalog: type, product, duration, valid until', '',
   (select count(*) from col where t = 'incentive_catalog'
     and c in ('incentive_type','product_id','duration','valid_until')) = 4),
  ('0232  change events carry an effective date', '',
   exists (select 1 from col where t = 'incentive_catalog_events' and c = 'effective_date')),
  ('0232  incentive_eligibility is still ROHAN''S shape (the merge decision)', '',
   exists (select 1 from col where t = 'incentive_eligibility' and c = 'incentive_id')
   and not exists (select 1 from col where t = 'incentive_eligibility' and c = 'removed_effective_from')),

  -- ── 0234 functions replace departments ──────────────────────────────────
  ('0234  every department was copied into functions, same id', '',
   not exists (select 1 from departments d where not exists (select 1 from functions f where f.id = d.id))),
  ('0234  departments kept as the backup', (select count(*) from departments)::text || ' rows',
   (select count(*) from departments) > 0),
  ('0234  employees'' Function points at functions', '',
   exists (select 1 from fk_target where conname = 'employees_department_id_fkey' and target = 'functions')),
  ('0234  extra-Function links point at functions', '',
   exists (select 1 from fk_target where conname = 'employee_departments_department_id_fkey' and target = 'functions')),
  ('0234  JD positions point at functions', '',
   exists (select 1 from fk_target where conname = 'jd_positions_department_id_fkey' and target = 'functions')),
  ('0234  nobody has a Function that does not exist', '',
   not exists (select 1 from employees e where e.department_id is not null
                and not exists (select 1 from functions f where f.id = e.department_id))),

  -- ── 0240 / 0241 ─────────────────────────────────────────────────────────
  ('0240  incentive_entries: reversed, reversed_at, reversed_by_id', '',
   (select count(*) from col where t = 'incentive_entries'
     and c in ('reversed','reversed_at','reversed_by_id')) = 3),
  ('0241  template_files exists', '',
   to_regclass('public.template_files') is not null),

  -- ── HR ACCESS — compare with PART 0 ─────────────────────────────────────
  -- The same count PART 0 took, now read through `functions`. It must be no
  -- lower than before: HR staff get the HR module through this membership.
  ('HR    active people in HR — must be no lower than PART 0''s number',
   (select count(distinct e.id) from employees e
     where e.is_active
       and (lower(btrim(coalesce(e.department, ''))) = 'hr'
            or exists (select 1 from functions f where f.id = e.department_id and lower(f.name) = 'hr')
            or exists (select 1 from employee_departments ed join functions f on f.id = ed.department_id
                        where ed.employee_id = e.id and lower(f.name) = 'hr')))::text,
   (select count(distinct e.id) from employees e
     where e.is_active
       and (lower(btrim(coalesce(e.department, ''))) = 'hr'
            or exists (select 1 from functions f where f.id = e.department_id and lower(f.name) = 'hr')
            or exists (select 1 from employee_departments ed join functions f on f.id = ed.department_id
                        where ed.employee_id = e.id and lower(f.name) = 'hr'))) > 0)

) as v(check_name, detail, ok)
order by check_name;
