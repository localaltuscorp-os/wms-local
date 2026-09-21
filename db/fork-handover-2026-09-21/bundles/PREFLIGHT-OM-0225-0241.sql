-- PART 0 - PREFLIGHT for the Om branch migrations (0225-0232, 0234, 0240, 0241).
-- Read-only. Changes nothing.
-- Read the RESULT column: nothing may say STOP. Note the HR number in section 6.
-- There are no comments below this line on purpose. The Supabase SQL editor
-- misreads an apostrophe inside a comment as a quote, and that broke the
-- previous version of this file. The reasoning behind every check is in the
-- git history of this file.

select section, item, detail, result from (

  select 1 as ord, '1. table exists' as section, t.name as item, '' as detail,
         case when to_regclass('public.' || t.name) is null
              then 'STOP — table missing' else 'OK' end as result
    from (values ('employees'), ('departments'), ('employee_departments'),
                 ('jd_positions'), ('paying_entities'), ('outstanding_products'),
                 ('incentive_catalog'), ('incentive_requests'), ('incentive_entries'),
                 ('incentive_eligibility')) as t(name)

  union all

  select 2, '2. eligibility table shape', 'incentive_eligibility.incentive_id', '',
         case when exists (select 1 from information_schema.columns
                            where table_name = 'incentive_eligibility' and column_name = 'incentive_id')
              then 'OK — the Rohan table, as the code now expects'
              else 'STOP — not the Rohan shape; the Incentive Master will not work' end
  union all
  select 2, '2. eligibility table shape', 'no removed_effective_from (the old Om design)', '',
         case when exists (select 1 from information_schema.columns
                            where table_name = 'incentive_eligibility' and column_name = 'removed_effective_from')
              then 'STOP — the old Om table is here; the plan assumed it never reached production'
              else 'OK' end

  union all

  select 3, '3. duplicate employee codes (0225)', code, n::text || ' employees',
         'STOP — the 0225 unique index would fail'
    from (select lower(to_jsonb(e) ->> 'employee_code') as code, count(*) as n
            from employees e
           where to_jsonb(e) ->> 'employee_code' is not null
           group by 1 having count(*) > 1) d
  union all
  select 3, '3. duplicate employee codes (0225)', '(none)', '', 'OK'
   where not exists (select 1 from employees e
                      where to_jsonb(e) ->> 'employee_code' is not null
                      group by lower(to_jsonb(e) ->> 'employee_code') having count(*) > 1)

  union all

  select 4, '4. incentive request status (0230)', coalesce(status, '(null)'), count(*)::text || ' rows',
         case when status in ('pending','approved','rejected','due','not_due','reversed','revision_requested')
              then 'OK' else 'STOP — the 0230 status rule would fail on these' end
    from incentive_requests
   group by status

  union all

  select 5, '5. Function move (0234)', 'departments copied into functions',
         (select count(*) from departments)::text, 'INFO — the Om handoff expected 17'
  union all
  select 5, '5. Function move (0234)', 'employees whose Function would be CLEARED',
         (select count(*) from employees e
           where e.department_id is not null
             and not exists (select 1 from departments d where d.id = e.department_id)
             and not exists (select 1 from departments d
                              where e.department is not null
                                and lower(btrim(e.department)) = lower(d.name)))::text,
         case when exists (select 1 from employees e
                            where e.department_id is not null
                              and not exists (select 1 from departments d where d.id = e.department_id)
                              and not exists (select 1 from departments d
                                               where e.department is not null
                                                 and lower(btrim(e.department)) = lower(d.name)))
              then 'STOP — people would lose their Function; expected 0'
              else 'OK — expected 0' end
  union all
  select 5, '5. Function move (0234)', 'employees whose broken Function link gets REPAIRED by name',
         (select count(*) from employees e
           where e.department_id is not null
             and not exists (select 1 from departments d where d.id = e.department_id)
             and exists (select 1 from departments d
                          where e.department is not null
                            and lower(btrim(e.department)) = lower(d.name)))::text,
         'INFO — a repair, not a loss'
  union all
  select 5, '5. Function move (0234)', 'extra-Function links that would be DELETED',
         (select count(*) from employee_departments ed
           where not exists (select 1 from departments d where d.id = ed.department_id))::text,
         case when exists (select 1 from employee_departments ed
                            where not exists (select 1 from departments d where d.id = ed.department_id))
              then 'STOP — links would be deleted; expected 0'
              else 'OK — expected 0' end
  union all
  select 5, '5. Function move (0234)', 'Function names duplicated ignoring case',
         (select count(*) from (select lower(name) from departments group by lower(name) having count(*) > 1) x)::text,
         case when exists (select 1 from departments group by lower(name) having count(*) > 1)
              then 'STOP — the unique name index would fail'
              else 'OK — expected 0' end
  union all
  select 5, '5. Function move (0234)', 'JD positions pointing at a missing Function',
         (select count(*) from jd_positions p
           where p.department_id is not null
             and not exists (select 1 from departments d where d.id = p.department_id))::text,
         case when exists (select 1 from jd_positions p
                            where p.department_id is not null
                              and not exists (select 1 from departments d where d.id = p.department_id))
              then 'STOP — the new foreign key would fail'
              else 'OK — expected 0' end

  union all

  select 6, '6. HR access', 'active people in HR (by text or by link)',
         (select count(distinct e.id) from employees e
           where e.is_active
             and (lower(btrim(coalesce(e.department, ''))) = 'hr'
                  or exists (select 1 from departments d where d.id = e.department_id and lower(d.name) = 'hr')
                  or exists (select 1 from employee_departments ed join departments d on d.id = ed.department_id
                              where ed.employee_id = e.id and lower(d.name) = 'hr')))::text,
         'INFO — the Om handoff expected 7. Note it for PART 2'
  union all
  select 6, '6. HR access', 'HR people who would lose their HR link in the move',
         (select count(*) from employee_departments ed
           join employees e on e.id = ed.employee_id
          where not exists (select 1 from departments d where d.id = ed.department_id)
            and lower(btrim(coalesce(e.department, ''))) = 'hr')::text,
         case when exists (select 1 from employee_departments ed
                             join employees e on e.id = ed.employee_id
                            where not exists (select 1 from departments d where d.id = ed.department_id)
                              and lower(btrim(coalesce(e.department, ''))) = 'hr')
              then 'STOP — someone in HR could lose HR access'
              else 'OK — expected 0' end

  union all

  select 7, '7. paying entities (0227)', n.name,
         (select count(*) from paying_entities p where p.name = n.name)::text || ' found',
         case (select count(*) from paying_entities p where p.name = n.name)
           when 1 then 'OK'
           when 0 then 'INFO — not in this database; it simply gets no letter'
           else 'STOP — named twice; both would get the same letter and the unique index would fail'
         end
    from (values ('Altus Corp'), ('Unleashed'), ('Khushboo'),
                 ('The Gainmakers (MJV HUF)'), ('Legacy Creators (JSV HUF)')) as n(name)

  union all

  select 8, '8. already applied?', c.what, '',
         case when c.present then 'already there — PART 1 will skip it' else 'will be added' end
    from (values
      ('0225  functions / shift_types / employee_code_registry',
       to_regclass('public.employee_code_registry') is not null),
      ('0226  billing_entity_files',       to_regclass('public.billing_entity_files') is not null),
      ('0227  paying_entities.code_prefix',
       exists (select 1 from information_schema.columns
                where table_name = 'paying_entities' and column_name = 'code_prefix')),
      ('0228  employees Saturday hours',
       exists (select 1 from pg_constraint where conname = 'employees_sat_hours_ordered')),
      ('0229  incentive_requests.split',
       exists (select 1 from information_schema.columns
                where table_name = 'incentive_requests' and column_name = 'split')),
      ('0230  incentive_request_submissions', to_regclass('public.incentive_request_submissions') is not null),
      ('0231  incentive_catalog_events',      to_regclass('public.incentive_catalog_events') is not null),
      ('0232  incentive_catalog.duration',
       exists (select 1 from information_schema.columns
                where table_name = 'incentive_catalog' and column_name = 'duration')),
      ('0234  employees FK points at functions',
       exists (select 1 from pg_constraint c join pg_class t on t.oid = c.confrelid
                where c.conname = 'employees_department_id_fkey' and t.relname = 'functions')),
      ('0240  incentive_entries.reversed',
       exists (select 1 from information_schema.columns
                where table_name = 'incentive_entries' and column_name = 'reversed')),
      ('0241  template_files',              to_regclass('public.template_files') is not null)
    ) as c(what, present)

) as preflight
order by ord,
         case when result like 'STOP%' then 0 when result like 'WARN%' then 1 else 2 end,
         item;
