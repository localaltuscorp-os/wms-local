-- ===========================================================================
--  VERIFY — Control Panel (roles + role_permissions + employee_roles)
--  Altus WMS | branch Om | read-only. Run AFTER
--  Change-made/SQL/13-apply-control-panel.sql.
-- ===========================================================================
--
--  Nothing here writes. Numbers below were read off the Supabase database this
--  branch points at on 2026-09-22, immediately after 0246 ran.

-- ---------------------------------------------------------------------------
-- 1. THE THREE TABLES. Expect three rows.
-- ---------------------------------------------------------------------------
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('roles', 'role_permissions', 'employee_roles')
 order by table_name;

-- ---------------------------------------------------------------------------
-- 2. THE SEEDED SUPER ADMIN. Expect one row, is_system = true.
-- ---------------------------------------------------------------------------
select name, is_system
  from roles
 where is_system = true;

-- ---------------------------------------------------------------------------
-- 3. THE UNIQUE INDEXES. Expect roles_name_uq, role_permissions_uq,
--    employee_roles_uq.
-- ---------------------------------------------------------------------------
select indexname
  from pg_indexes
 where tablename in ('roles', 'role_permissions', 'employee_roles')
 order by indexname;

-- ---------------------------------------------------------------------------
-- 4. THE COLUMNS THE APP READS.
--    role_permissions: node_key, action, scope.
-- ---------------------------------------------------------------------------
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('role_permissions', 'employee_roles')
   and column_name in ('node_key', 'action', 'scope', 'employee_id', 'role_id')
 order by table_name, column_name;

-- ---------------------------------------------------------------------------
-- 5. ROLE MEMBERSHIP. Expect one row per (employee, role); no duplicates.
-- ---------------------------------------------------------------------------
select count(*) as assignments,
       count(distinct employee_id || ':' || role_id) as distinct_pairs
  from employee_roles;
-- (2026-09-22) 0 rows immediately after apply; this stays 0 until roles are
--   assigned through the Control Panel.
