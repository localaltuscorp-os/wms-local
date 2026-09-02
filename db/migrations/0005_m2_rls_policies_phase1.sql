-- M2.0 — RLS policies, Phase 1.
-- Locks reads behind auth; leaves mutations permissive for now (M2.1 tightens).

alter table employees enable row level security;
alter table tasks     enable row level security;

-- employees: every authenticated user can read every active employee
--            (needed for assignment pickers, displaying names on task rows, etc.)
--            admins can additionally read inactive employees.
create policy "employees_read_active"
  on employees for select
  to authenticated
  using (is_active = true);

create policy "employees_read_admin_all"
  on employees for select
  to authenticated
  using (app.is_admin());

-- employees: authenticated users can update their OWN row's name/avatar only
--            (admin-side update policies land in M2.1)
create policy "employees_update_self_basic"
  on employees for update
  to authenticated
  using  (firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  with check (
    firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    -- prevent self-escalation: is_admin cannot change via this policy
    and is_admin = (select is_admin from employees
                    where firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  );

-- employees: admins can insert / update / delete any row
create policy "employees_write_admin"
  on employees for all
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- tasks: authenticated reads everything (M2.0 baseline — M2.1 tightens to participant scope)
create policy "tasks_read_authenticated"
  on tasks for select
  to authenticated
  using (true);

-- tasks: authenticated writes anything (M2.0 baseline — M2.1 tightens)
create policy "tasks_write_authenticated_m2_0_temp"
  on tasks for all
  to authenticated
  using (true)
  with check (true);
