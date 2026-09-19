-- ============================================================================
--  PART 0 — PREFLIGHT for Om's migrations (0225–0232, 0234, 0240, 0241).
--  Read-only. Changes NOTHING.
--
--  Answers: "will PART 1 succeed on the data actually in this database, and
--  will it lose anything?" Four of these migrations add a rule to a table that
--  already holds a year of real rows, and 0234 moves the Function list and
--  cleans broken links. This finds any row that would break a rule or be
--  cleared — by name — before anything runs.
--
--  ONE result table on purpose: the Supabase SQL editor shows only the LAST
--  statement's result.
--
--  Read the RESULT column. Nothing may say STOP. If anything does, send the
--  whole table to Claude before running PART 1.
--
--  0234's own header quotes "19 of 26 employees" and "48 of 75 rows". Those
--  numbers come from a DIFFERENT database (aws-0-ap-south-1), not production.
--  Om's handoff expects production to show 0 cleared links and 0 deleted rows;
--  sections 5 and 6 below are what check that.
-- ============================================================================

select section, item, detail, result from (

  -- ── 1. Tables these migrations alter must already exist ──────────────────
  select 1 as ord, '1. table exists' as section, t.name as item, '' as detail,
         case when to_regclass('public.' || t.name) is null
              then 'STOP — table missing' else 'OK' end as result
    from (values ('employees'), ('departments'), ('employee_departments'),
                 ('jd_positions'), ('paying_entities'), ('outstanding_products'),
                 ('incentive_catalog'), ('incentive_requests'), ('incentive_entries'),
                 ('incentive_eligibility')) as t(name)

  union all

  -- ── 2. incentive_eligibility must be ROHAN'S shape (the merge kept it) ───
  select 2, '2. eligibility table shape', 'incentive_eligibility.incentive_id', '',
         case when exists (select 1 from information_schema.columns
                            where table_name = 'incentive_eligibility' and column_name = 'incentive_id')
              then 'OK — Rohan''s table, as the code now expects'
              else 'STOP — not Rohan''s shape; the Incentive Master will not work' end
  union all
  select 2, '2. eligibility table shape', 'no removed_effective_from (Om''s old design)', '',
         case when exists (select 1 from information_schema.columns
                            where table_name = 'incentive_eligibility' and column_name = 'removed_effective_from')
              then 'STOP — Om''s old table is here; the plan assumed it never reached production'
              else 'OK' end

  union all

  -- ── 3. 0225: employee codes must be unique, ignoring case ────────────────
  -- Read through to_jsonb because 0225 is what ADDS `employee_code`: on a
  -- database it has not reached, naming the column would fail the whole
  -- preflight. This way it simply finds no codes.
  select 3, '3. duplicate employee codes (0225)', code, n::text || ' employees',
         'STOP — 0225''s unique index would fail'
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

  -- ── 4. 0230: every incentive request status must be one it allows ────────
  select 4, '4. incentive request status (0230)', coalesce(status, '(null)'), count(*)::text || ' rows',
         case when status in ('pending','approved','rejected','due','not_due','reversed','revision_requested')
              then 'OK' else 'STOP — 0230''s status rule would fail on these' end
    from incentive_requests
   group by status

  union all

  -- ── 5. 0234: the Function move, checked the way Om's handoff lists ───────
  select 5, '5. Function move (0234)', 'departments copied into functions',
         (select count(*) from departments)::text, 'INFO — Om''s handoff expected 17'
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

  -- ── 6. HR ACCESS DEPENDS ON THIS — who is in HR, before the move ─────────
  -- HR staff get the HR module by being in the HR Function, through either the
  -- text column or an extra-Function link. Note this number, and compare it
  -- with the same row in PART 2 afterwards: it must not go down.
  select 6, '6. HR access', 'active people in HR (by text or by link)',
         (select count(distinct e.id) from employees e
           where e.is_active
             and (lower(btrim(coalesce(e.department, ''))) = 'hr'
                  or exists (select 1 from departments d where d.id = e.department_id and lower(d.name) = 'hr')
                  or exists (select 1 from employee_departments ed join departments d on d.id = ed.department_id
                              where ed.employee_id = e.id and lower(d.name) = 'hr')))::text,
         'INFO — Om''s handoff expected 7. Note it for PART 2'
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

  -- ── 7. 0227: the five paying entities it gives a code letter ─────────────
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

  -- ── 8. Already applied? All are idempotent; either answer is fine ────────
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
