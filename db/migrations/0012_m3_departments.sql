-- M3 — departments: real table replacing the free-text employees.department
-- column with an admin-managed canonical list.
--
-- Migration strategy is intentionally SOFT: we add the new table + FK
-- column + backfill, but KEEP the old employees.department text column
-- in place.  Every downstream reader (status-table, dashboard, CSV,
-- detail page) currently reads the text column; we don't break them.
-- Server actions that set a department write BOTH columns from the
-- moment this migration lands, so the text column stays in sync with
-- the FK going forward.  The text column drop is a follow-up migration
-- once we've verified the FK is the authoritative source.
--
-- Idempotent: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING
-- / DROP … IF EXISTS so re-runs are safe.

create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists departments_active_sort_idx
  on departments(is_active, sort_order, name);

-- Seed from the distinct non-null department values already on employees.
-- Empty strings are filtered out so they don't become "" department rows.
insert into departments (name)
  select distinct trim(department)
  from employees
  where department is not null
    and trim(department) <> ''
on conflict (name) do nothing;

-- FK column on employees + backfill (case-insensitive match in case
-- mixed-case slipped in historically).
alter table employees
  add column if not exists department_id uuid
    references departments(id) on delete set null;

update employees e
  set department_id = d.id
  from departments d
  where e.department_id is null
    and e.department is not null
    and lower(trim(e.department)) = lower(d.name);

create index if not exists employees_department_id_idx on employees(department_id);

------------------------------------------------------------------------
-- RLS — read by anyone authenticated, write admin-only.
------------------------------------------------------------------------

alter table departments enable row level security;

drop policy if exists "departments_read_authenticated" on departments;
drop policy if exists "departments_insert_admin"      on departments;
drop policy if exists "departments_update_admin"      on departments;
drop policy if exists "departments_delete_admin"      on departments;

create policy "departments_read_authenticated"
  on departments for select
  to authenticated
  using (true);

create policy "departments_insert_admin"
  on departments for insert
  to authenticated
  with check (app.is_admin());

create policy "departments_update_admin"
  on departments for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- DELETE: not exposed.  Admins deactivate instead.
revoke delete on departments from authenticated;
revoke delete on departments from anon;
