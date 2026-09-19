-- ============================================================================
--  DIAGNOSE: what in this database refers to a `functions` table that does
--  not exist? Read-only. Changes NOTHING.
--
--  PREFLIGHT-OM-0225-0241.sql never names `functions`, yet it failed with
--  "relation functions does not exist". Postgres only allows that through
--  something LATE-BOUND — a database function whose body is checked when it
--  runs, reached from a view, a row-level-security policy or a trigger. This
--  lists every candidate, so the fix can go at the actual cause.
--
--  Paste the whole file, run it, and send the result table to Claude.
-- ============================================================================

select kind, name, detail from (

  -- Who is running this, and does RLS apply to them?
  select 1 as ord, 'role' as kind, current_user::text as name,
         'bypass RLS: ' || coalesce((select rolbypassrls::text from pg_roles where rolname = current_user), '?') as detail

  union all
  -- The tables the preflight reads: are they really tables?
  select 2, 'object type', c.relname::text,
         case c.relkind when 'r' then 'table' when 'v' then 'VIEW' when 'm' then 'MATERIALIZED VIEW'
                        when 'p' then 'partitioned table' when 'f' then 'foreign table' else c.relkind::text end
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('departments', 'functions', 'employees', 'employee_departments', 'jd_positions',
                       'paying_entities', 'outstanding_products', 'incentive_catalog',
                       'incentive_requests', 'incentive_entries', 'incentive_eligibility')

  union all
  -- Views whose definition mentions `functions`.
  select 3, 'view', schemaname || '.' || viewname, left(regexp_replace(definition, '\s+', ' ', 'g'), 200)
    from pg_views
   where schemaname not in ('pg_catalog', 'information_schema')
     and definition ~* '\mfunctions\M'

  union all
  -- Database functions whose BODY mentions `functions` (late-bound: allowed to
  -- exist even though the table does not).
  select 4, 'db function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         left(regexp_replace(p.prosrc, '\s+', ' ', 'g'), 200)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema', 'extensions', 'graphql', 'graphql_public',
                           'pgbouncer', 'realtime', 'supabase_functions', 'vault', 'net', 'pgsodium',
                           'pgsodium_masks', 'storage', 'auth')
     and p.prosrc ~* '\mfunctions\M'

  union all
  -- Row-level-security policies on the tables the preflight reads, with the
  -- functions they call — the usual route from a plain SELECT to a late-bound
  -- body.
  select 5, 'RLS policy', tablename || ' · ' || policyname,
         'roles ' || array_to_string(roles, ',') || ' · ' || left(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 160)
    from pg_policies
   where schemaname = 'public'
     and tablename in ('departments', 'employees', 'employee_departments', 'jd_positions', 'paying_entities',
                       'incentive_requests', 'incentive_catalog', 'incentive_entries', 'incentive_eligibility')

  union all
  -- Is RLS switched on for those tables at all?
  select 6, 'RLS enabled', c.relname::text,
         case when c.relrowsecurity then 'ON' else 'off' end || case when c.relforcerowsecurity then ' (FORCED)' else '' end
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('departments', 'employees', 'employee_departments', 'jd_positions', 'paying_entities',
                       'incentive_requests', 'incentive_catalog', 'incentive_entries', 'incentive_eligibility')
     and c.relkind = 'r'

  union all
  -- Anything named `functions` in ANY schema — a search_path surprise.
  select 7, 'named functions', n.nspname || '.' || c.relname, c.relkind::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relname = 'functions'

  union all
  select 8, 'search_path', current_setting('search_path'), ''

) d
order by ord, name;
