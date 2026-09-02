-- M2.3 — notifications: per-recipient, per-event mailbox rows.
-- Supersedes the M2.3-lite reader that joined task_events directly into
-- /inbox. read_at is the source of truth for "unread"; the older
-- last_inbox_visit_at marker on employees stays in the schema for now
-- (we just stop using it for the unread badge math).
--
-- Idempotent: every statement is CREATE … IF NOT EXISTS, plus DROP …
-- IF EXISTS around the policies before re-creating them.

create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references employees(id) on delete cascade,
  task_id         uuid references tasks(id) on delete cascade,
  event_id        uuid references task_events(id) on delete set null,
  kind            text not null,
  title           text not null,
  body            text,
  actor_id        uuid references employees(id) on delete set null,
  read_at         timestamptz,
  email_sent_at   timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_user_unread_created_idx
  on notifications(user_id, read_at, created_at desc);

create index if not exists notifications_user_kind_created_idx
  on notifications(user_id, kind, created_at desc);

create index if not exists notifications_created_idx
  on notifications(created_at desc);

------------------------------------------------------------------------
-- RLS — per-recipient privacy.
------------------------------------------------------------------------

alter table notifications enable row level security;

drop policy if exists "notifications_read_recipient_or_admin" on notifications;
drop policy if exists "notifications_insert_authenticated" on notifications;
drop policy if exists "notifications_update_recipient_read_at" on notifications;

-- SELECT: recipient sees their own rows; admins see everything.
create policy "notifications_read_recipient_or_admin"
  on notifications for select
  to authenticated
  using (
    app.is_admin()
    or user_id = app.current_employee_id()
  );

-- INSERT: any authenticated user may write a notification.  Server
--         Actions fan out on behalf of the actor; we don't pin the
--         author here because notifications can ALSO be created by
--         cron / digest jobs running under service-role.
create policy "notifications_insert_authenticated"
  on notifications for insert
  to authenticated
  with check (true);

-- UPDATE: recipient may flip read_at on their own rows; admins can
--         update anything.  No other column is mutable from app code
--         (Server Actions only ever SET read_at).
create policy "notifications_update_recipient_read_at"
  on notifications for update
  to authenticated
  using (
    app.is_admin()
    or user_id = app.current_employee_id()
  )
  with check (
    app.is_admin()
    or user_id = app.current_employee_id()
  );

-- DELETE: not exposed in M2.3.  No policy = denied.
revoke delete on notifications from authenticated;
revoke delete on notifications from anon;
