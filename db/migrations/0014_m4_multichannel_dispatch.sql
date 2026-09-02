-- M4 — multi-channel dispatch: per-channel opt-in flags on employees,
-- delivered_channels audit array on notifications, push_subscriptions
-- table for Web Push. Idempotent across re-runs.

alter table employees
  add column if not exists slack_user_id            text,
  add column if not exists email_opt_in             boolean not null default true,
  add column if not exists slack_opt_in             boolean not null default true,
  add column if not exists whatsapp_phone           text,
  add column if not exists whatsapp_opted_in        boolean not null default false,
  add column if not exists whatsapp_template_locale text not null default 'en';

alter table notifications
  add column if not exists delivered_channels text[] not null default '{}';

update notifications
  set delivered_channels = array['email']
  where email_sent_at is not null
    and delivered_channels = '{}';

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references employees(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subs_read_self_or_admin"    on push_subscriptions;
drop policy if exists "push_subs_insert_self"            on push_subscriptions;
drop policy if exists "push_subs_delete_self_or_admin"   on push_subscriptions;

create policy "push_subs_read_self_or_admin"
  on push_subscriptions for select
  to authenticated
  using (app.is_admin() or user_id = app.current_employee_id());

create policy "push_subs_insert_self"
  on push_subscriptions for insert
  to authenticated
  with check (user_id = app.current_employee_id());

create policy "push_subs_delete_self_or_admin"
  on push_subscriptions for delete
  to authenticated
  using (app.is_admin() or user_id = app.current_employee_id());
