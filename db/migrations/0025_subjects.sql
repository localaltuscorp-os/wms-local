-- Subjects — canonical list backing the "Subject" picker on the task forms.
-- Mirrors clients (0022): table + index + seed + RLS. INSERT open to any
-- authenticated user ("+ Add new subject…"), UPDATE admin-only, no DELETE.
--
-- Idempotent: create-if-not-exists + ON CONFLICT DO NOTHING.

create table if not exists subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subjects_active_name_idx
  on subjects(is_active, name);

-- Seed Manan's subject roster (2026-05).
insert into subjects (name) values
  ('Accounts'), ('Admin'), ('Personal'), ('Marketing'), ('Sales'),
  ('CRM'), ('Website'), ('App'), ('Consulting'), ('PS'), ('BSS'),
  ('MIS'), ('Tally'), ('Handholding'), ('Approvals'), ('DCC'), ('KPI'),
  ('Collection'), ('PSO'), ('Incentive'), ('Back Office'), ('Data'),
  ('Follow Ups'), ('Billing'), ('Jodo'), ('Pay U'), ('Recruitment'),
  ('HR'), ('WMS'), ('Social Media'), ('Interviews'), ('Insta Videos'),
  ('Training'), ('SOP')
on conflict (name) do nothing;

-- Also fold in any subject already present on imported tasks so they're
-- manageable + counted (and not orphaned in the picker).
insert into subjects (name)
  select distinct trim(subject) from tasks
  where subject is not null and trim(subject) <> ''
on conflict (name) do nothing;

------------------------------------------------------------------------
-- RLS — read + insert by any authenticated user, update admin-only, no delete.
------------------------------------------------------------------------
alter table subjects enable row level security;

drop policy if exists "subjects_read_authenticated"   on subjects;
drop policy if exists "subjects_insert_authenticated" on subjects;
drop policy if exists "subjects_update_admin"         on subjects;

create policy "subjects_read_authenticated"
  on subjects for select
  to authenticated
  using (true);

create policy "subjects_insert_authenticated"
  on subjects for insert
  to authenticated
  with check (true);

create policy "subjects_update_admin"
  on subjects for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

revoke delete on subjects from authenticated;
revoke delete on subjects from anon;
