-- Multi-department membership — a person can belong to several departments.
--
-- Adds the `employee_departments` join table as the source of truth for
-- membership.  The legacy single-department columns on `employees`
-- (department text + department_id FK) are repurposed to mean the PRIMARY
-- department: exactly one membership row carries is_primary = true and is
-- kept in lock-step with those columns by the invite/edit server actions.
-- Every single-label reader (task rows, CSV export, status-table fallback)
-- keeps working unchanged — it now shows the primary department.
--
-- Also reconciles the canonical department list to the 11 Altus Corp
-- departments: renames "Hand Holding" -> "Handholding" and seeds the three
-- new ones (Founder Office, Social Media, CRM).
--
-- Idempotent: create-if-not-exists / ON CONFLICT / guarded renames so
-- re-runs are safe.

------------------------------------------------------------------------
-- 1. Reconcile the department roster.
------------------------------------------------------------------------

-- Rename the old free-text spelling.  Guarded so it's a no-op if the new
-- name already exists (avoids tripping the unique constraint on re-run).
update departments
  set name = 'Handholding', updated_at = now()
  where name = 'Hand Holding'
    and not exists (select 1 from departments d2 where d2.name = 'Handholding');

-- Keep the legacy text column on employees in sync with the rename.
update employees set department = 'Handholding' where department = 'Hand Holding';

-- Seed / re-order the canonical list.  ON CONFLICT re-activates and
-- re-orders existing rows so the admin panel + filter bar match the
-- business's department order.
insert into departments (name, sort_order, is_active) values
  ('Founder Office', 10,  true),
  ('Handholding',    20,  true),
  ('Apps',           30,  true),
  ('Sales',          40,  true),
  ('Marketing',      50,  true),
  ('Social Media',   60,  true),
  ('Accounts',       70,  true),
  ('Admin',          80,  true),
  ('HR',             90,  true),
  ('Consulting',     100, true),
  ('CRM',            110, true)
on conflict (name) do update
  set sort_order = excluded.sort_order,
      is_active  = true,
      updated_at = now();

------------------------------------------------------------------------
-- 2. Membership join table.
------------------------------------------------------------------------

create table if not exists employee_departments (
  employee_id   uuid not null references employees(id)   on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (employee_id, department_id)
);

create index if not exists employee_departments_department_idx
  on employee_departments(department_id);
create index if not exists employee_departments_employee_idx
  on employee_departments(employee_id);

-- Backfill: every employee already linked to a department becomes a
-- primary membership.  ON CONFLICT keeps re-runs idempotent.
insert into employee_departments (employee_id, department_id, is_primary)
  select id, department_id, true
  from employees
  where department_id is not null
on conflict (employee_id, department_id) do nothing;

------------------------------------------------------------------------
-- 3. RLS — read by anyone authenticated, write admin-only (mirrors
--    `departments`).  The app's server actions connect as the DB owner
--    and bypass RLS; these policies guard any direct Supabase access.
------------------------------------------------------------------------

alter table employee_departments enable row level security;

drop policy if exists "employee_departments_read_authenticated" on employee_departments;
drop policy if exists "employee_departments_insert_admin"       on employee_departments;
drop policy if exists "employee_departments_update_admin"       on employee_departments;
drop policy if exists "employee_departments_delete_admin"       on employee_departments;

create policy "employee_departments_read_authenticated"
  on employee_departments for select
  to authenticated
  using (true);

create policy "employee_departments_insert_admin"
  on employee_departments for insert
  to authenticated
  with check (app.is_admin());

create policy "employee_departments_update_admin"
  on employee_departments for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy "employee_departments_delete_admin"
  on employee_departments for delete
  to authenticated
  using (app.is_admin());
