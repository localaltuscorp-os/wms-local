-- ===========================================================================
--  VERIFY — Control Panel becomes a module of its own
--  Altus WMS | branch Om | read-only. Run AFTER
--  Change-made/SQL/17-apply-control-panel-module.sql.
-- ===========================================================================
--
--  Nothing here writes. The comments beside each query are what the Supabase
--  database this branch points at returned on 2026-09-24, immediately after
--  0251 ran.

-- ---------------------------------------------------------------------------
-- 1. NO ROWS LEFT ON THE OLD KEYS. Expect 0.
--    If this returns anything, 17 did not run.
-- ---------------------------------------------------------------------------
select 'module_permissions' as table_name, node_key, count(*) as rows
  from module_permissions
 where node_key in (
   'admin.control-panel',
   'admin.control-panel.users',
   'admin.control-panel.roles',
   'admin.control-panel.permissions',
   'admin.control-panel.effective-access',
   'admin.temporary-access'
 )
 group by node_key

union all

select 'role_permissions', node_key, count(*)
  from role_permissions
 where node_key in (
   'admin.control-panel',
   'admin.control-panel.users',
   'admin.control-panel.roles',
   'admin.control-panel.permissions',
   'admin.control-panel.effective-access',
   'admin.temporary-access'
 )
 group by node_key;
-- (2026-09-24) 0 rows. No grant had ever been made against the old keys, which
--   is why the same query returns 0 for the new ones in query 2 — the move had
--   nothing to move, and nobody's access changed.

-- ---------------------------------------------------------------------------
-- 2. WHAT NOW SITS ON THE NEW KEYS. Expect 0 on the branch's database; expect
--    the same count you saw in query 1 on a database where grants existed.
-- ---------------------------------------------------------------------------
select 'module_permissions' as table_name, node_key, count(*) as rows
  from module_permissions
 where node_key like 'control-panel%'
 group by node_key

union all

select 'role_permissions', node_key, count(*)
  from role_permissions
 where node_key like 'control-panel%'
 group by node_key;
-- (2026-09-24) 0 rows.

-- ---------------------------------------------------------------------------
-- 3. THE LEDGER. Expect one row, applied_at on the day you ran it.
-- ---------------------------------------------------------------------------
select filename, applied_at
  from __schema_applied
 where filename = '0251_control_panel_module.sql';

-- ---------------------------------------------------------------------------
-- 4. THE ROW COUNT DID NOT MOVE. An UPDATE cannot add or remove a row, so this
--    total must equal the number you read here BEFORE running 17. Run it both
--    times; the point is that the two numbers are identical.
-- ---------------------------------------------------------------------------
select (select count(*) from module_permissions) as module_permission_rows,
       (select count(*) from role_permissions)   as role_permission_rows;
-- (2026-09-24) 0 and 0 — no overrides and no role grants had ever been stored,
--   which is why the move had nothing to move and nobody's access changed.

-- ---------------------------------------------------------------------------
-- 5. THE ROLE TABLES ARE INTACT AND EMPTY OF CONTROL PANEL NODES AT THE OLD
--    NAMES. Expect roles to be the same count as before the migration.
-- ---------------------------------------------------------------------------
select (select count(*) from roles)            as roles,
       (select count(*) from role_permissions) as role_permissions,
       (select count(*) from employee_roles)   as employee_roles;
-- (2026-09-24) unchanged from 14-verify-control-panel.sql: the migration only
--   rewrote node_key values, and there were none to rewrite.
