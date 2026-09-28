-- ============================================================================
-- 20 VERIFY - Control Panel simplification and Role UI
-- Read-only. No apply file exists because this change set has no database
-- migration or data transition.
-- ============================================================================

-- 1. Role inventory. Counts are environment-specific.
select
  r.id,
  r.name,
  r.is_system,
  count(distinct er.employee_id) as employee_count,
  count(distinct rp.id) as permission_count
from roles r
left join employee_roles er on er.role_id = r.id
left join role_permissions rp on rp.role_id = r.id
group by r.id, r.name, r.is_system
order by r.name;

-- 2. Basic role actions exposed by simplified Roles UI. Scope can still exist
-- in stored rows for runtime compatibility; this query reports it only.
select
  node_key,
  action,
  scope,
  count(*) as permission_rows
from role_permissions
group by node_key, action, scope
order by node_key, action, scope nulls first;

-- 3. Employee-to-role assignments. No row should change from this UI deployment.
select
  er.role_id,
  r.name as role_name,
  er.employee_id,
  e.employee_code,
  e.name as employee_name,
  e.email
from employee_roles er
join roles r on r.id = er.role_id
join employees e on e.id = er.employee_id
order by r.name, e.name;

-- 4. Legacy Master Admin capability grants. Report only; do not delete here.
select
  employee_id,
  capability,
  employee_email,
  granted_by_id,
  created_at
from capability_grants
where capability = 'master_admin.manage'
order by created_at desc;

-- 5. Legacy Control Panel Users node. Review any returned rows separately.
select 'module_permissions' as source, node_key, count(*) as row_count
from module_permissions
where node_key = 'control-panel.users'
group by node_key
union all
select 'role_permissions' as source, node_key, count(*) as row_count
from role_permissions
where node_key = 'control-panel.users'
group by node_key;
