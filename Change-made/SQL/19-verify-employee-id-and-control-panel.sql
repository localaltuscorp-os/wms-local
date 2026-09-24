-- ============================================================================
-- 19 VERIFY - Employee ID standardization / Control Panel
-- Read-only checks. Every query is safe to run repeatedly.
-- ============================================================================

-- 1. Employee Code uniqueness. Expect zero rows.
select upper(employee_code) as employee_code, count(*) as rows
  from employees
 where employee_code is not null
 group by upper(employee_code)
having count(*) > 1;

-- 2. Active employees without a code. Review and issue through the application
-- registry flow; do not repair with SQL max()+1.
select id, name, email, paying_entity_id, designation_id, is_active
  from employees
 where is_active = true
   and employee_code is null
 order by name;

-- 3. Registry ownership and retired-code history. Expect no active duplicate
-- ownership; retired codes are intentionally retained and must never be reused.
select code, employee_id, status, issued_at, retired_at
  from employee_code_registry
 order by prefix, seq;

-- 4. Old Control Panel permission keys. Expect zero rows.
select 'module_permissions' as source, node_key, count(*) as rows
  from module_permissions
 where node_key like 'admin.control-panel%'
    or node_key = 'admin.temporary-access'
 group by node_key
union all
select 'role_permissions', node_key, count(*)
  from role_permissions
 where node_key like 'admin.control-panel%'
    or node_key = 'admin.temporary-access'
 group by node_key;

-- 5. New top-level Control Panel grants. Counts are environment-specific.
select 'module_permissions' as source, node_key, count(*) as rows
  from module_permissions
 where node_key = 'control-panel'
    or node_key like 'control-panel.%'
 group by node_key
union all
select 'role_permissions', node_key, count(*)
  from role_permissions
 where node_key = 'control-panel'
    or node_key like 'control-panel.%'
 group by node_key;

-- 6. Confirm the canonical columns exist and employee.id remains UUID-backed.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'employees'
   and column_name in ('id', 'employee_code')
 order by ordinal_position;
