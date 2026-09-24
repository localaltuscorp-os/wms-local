-- ============================================================================
-- 19 APPLY - Employee ID standardization / Control Panel permission keys
-- Altus WMS | Employee ID means employees.employee_code
-- ============================================================================
--
-- Employee Code allocation is application-owned. Do NOT generate codes with a
-- raw SQL max()+1 update: that would bypass advisory locking, code history,
-- entity/intern prefix rules, retirement, and the registry uniqueness guard.
-- New employee codes are issued by lib/employees/code-registry.ts.
--
-- The only database data transition in this change set is the idempotent move
-- of existing Control Panel permission grants from the old Admin keys to the
-- top-level module keys. It is safe to run more than once.

begin;

do $$
begin
  if to_regclass('public.module_permissions') is not null then
    update module_permissions
       set node_key = case node_key
         when 'admin.control-panel' then 'control-panel'
         when 'admin.control-panel.users' then 'control-panel.users'
         when 'admin.control-panel.roles' then 'control-panel.roles'
         when 'admin.control-panel.permissions' then 'control-panel.permissions'
         when 'admin.control-panel.effective-access' then 'control-panel.effective-access'
         when 'admin.temporary-access' then 'control-panel.temporary-access'
       end
     where node_key in (
       'admin.control-panel', 'admin.control-panel.users',
       'admin.control-panel.roles', 'admin.control-panel.permissions',
       'admin.control-panel.effective-access', 'admin.temporary-access'
     );
  end if;

  if to_regclass('public.role_permissions') is not null then
    update role_permissions
       set node_key = case node_key
         when 'admin.control-panel' then 'control-panel'
         when 'admin.control-panel.users' then 'control-panel.users'
         when 'admin.control-panel.roles' then 'control-panel.roles'
         when 'admin.control-panel.permissions' then 'control-panel.permissions'
         when 'admin.control-panel.effective-access' then 'control-panel.effective-access'
         when 'admin.temporary-access' then 'control-panel.temporary-access'
       end
     where node_key in (
       'admin.control-panel', 'admin.control-panel.users',
       'admin.control-panel.roles', 'admin.control-panel.permissions',
       'admin.control-panel.effective-access', 'admin.temporary-access'
     );
  end if;
end $$;

commit;

-- Employee Code inventory (read-only; expected to be reviewed before issuing
-- any missing codes through the application):
select
  count(*) filter (where is_active = true) as active_employees,
  count(*) filter (where is_active = true and employee_code is not null) as active_with_code,
  count(*) filter (where is_active = true and employee_code is null) as active_missing_code,
  count(*) filter (where employee_code is not null) as all_with_code
from employees;
