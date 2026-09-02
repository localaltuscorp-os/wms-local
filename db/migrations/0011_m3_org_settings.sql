-- M3 — org_settings: single-row table holding organisation-wide knobs.
-- Editable from /admin/settings; readable by any authenticated user
-- because the cron, email layout and digest scheduler all need a few
-- of these values.  Single-row enforced by primary-key check (id = 1).
--
-- Idempotent: every statement is IF NOT EXISTS / ON CONFLICT DO
-- NOTHING / DROP … IF EXISTS so re-runs are safe.

create table if not exists org_settings (
  id                  int primary key default 1 check (id = 1),
  company_name        text not null default 'Altus Corp',
  logo_url            text,
  digest_hour_ist     int  not null default 9 check (digest_hour_ist between 0 and 23),
  working_days        int[] not null default array[1,2,3,4,5],
  timezone            text not null default 'Asia/Kolkata',
  allow_self_register boolean not null default false,
  updated_at          timestamptz not null default now(),
  updated_by_id       uuid references employees(id) on delete set null
);

-- Seed the single row.  ON CONFLICT keeps subsequent migrations idempotent.
insert into org_settings (id) values (1) on conflict do nothing;

------------------------------------------------------------------------
-- RLS — read by anyone authenticated, write admin-only.
------------------------------------------------------------------------

alter table org_settings enable row level security;

drop policy if exists "org_settings_read_authenticated" on org_settings;
drop policy if exists "org_settings_write_admin" on org_settings;

-- SELECT: every signed-in user can read settings (company name + logo
--         show up in emails, digest hour informs the cron handler).
create policy "org_settings_read_authenticated"
  on org_settings for select
  to authenticated
  using (true);

-- UPDATE: admins only.  No INSERT policy because the seed row is the
--         only row and the table-level CHECK prevents adding others.
create policy "org_settings_write_admin"
  on org_settings for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- DELETE: never.  No policy = denied.
revoke delete on org_settings from authenticated;
revoke delete on org_settings from anon;
