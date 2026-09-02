-- M3 close-out — append-only audit trails for admin-side mutations.
--
-- employee_events captures invite / edit / channel-flag / activation
-- changes on the employees table.  settings_events captures org_settings
-- updates and departments CRUD.  Both follow the task_events shape so
-- the future "Admin activity" feed can union them cheaply.
--
-- Idempotent: every statement is CREATE … IF NOT EXISTS / DROP …
-- IF EXISTS / REVOKE so re-runs are safe.

------------------------------------------------------------------------
-- employee_events
------------------------------------------------------------------------

create table if not exists employee_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  actor_id     uuid not null references employees(id) on delete restrict,
  event_type   text not null,
  from_value   jsonb,
  to_value     jsonb,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists employee_events_employee_created_idx
  on employee_events(employee_id, created_at desc);
create index if not exists employee_events_actor_created_idx
  on employee_events(actor_id, created_at desc);
create index if not exists employee_events_created_idx
  on employee_events(created_at desc);

alter table employee_events enable row level security;

drop policy if exists "employee_events_read_admin"        on employee_events;
drop policy if exists "employee_events_insert_admin"      on employee_events;

-- SELECT: admins only.  Employee profiles don't need to see their own
--         admin-change history; if that changes later we add a self-read
--         policy then.
create policy "employee_events_read_admin"
  on employee_events for select
  to authenticated
  using (app.is_admin());

-- INSERT: any authenticated user (server actions always pin actor_id =
--         app.current_employee_id() via WITH CHECK).  Server actions are
--         already requireAdmin()-guarded; the WITH CHECK is belt + braces.
create policy "employee_events_insert_admin"
  on employee_events for insert
  to authenticated
  with check (
    app.is_admin()
    and actor_id = app.current_employee_id()
  );

-- UPDATE / DELETE: audit rows are immutable.
revoke update, delete on employee_events from authenticated;
revoke update, delete on employee_events from anon;

------------------------------------------------------------------------
-- settings_events
------------------------------------------------------------------------
-- One table covers both org_settings updates and departments CRUD.
-- `scope` is the entity domain, `target_id` is the row id (text so we
-- can store the org_settings singleton key '1' alongside dept uuids).

create table if not exists settings_events (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null,
  target_id    text,
  actor_id     uuid not null references employees(id) on delete restrict,
  event_type   text not null,
  from_value   jsonb,
  to_value     jsonb,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists settings_events_scope_target_created_idx
  on settings_events(scope, target_id, created_at desc);
create index if not exists settings_events_actor_created_idx
  on settings_events(actor_id, created_at desc);
create index if not exists settings_events_created_idx
  on settings_events(created_at desc);

alter table settings_events enable row level security;

drop policy if exists "settings_events_read_admin"   on settings_events;
drop policy if exists "settings_events_insert_admin" on settings_events;

create policy "settings_events_read_admin"
  on settings_events for select
  to authenticated
  using (app.is_admin());

create policy "settings_events_insert_admin"
  on settings_events for insert
  to authenticated
  with check (
    app.is_admin()
    and actor_id = app.current_employee_id()
  );

revoke update, delete on settings_events from authenticated;
revoke update, delete on settings_events from anon;
