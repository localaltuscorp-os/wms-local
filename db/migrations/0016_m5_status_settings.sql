-- M5.1 — status_settings: per-status label + color override.
--
-- The 9 status IDs stay hard-coded (PK is FK to the task_status enum and the
-- table grants `update` only — no inserts/deletes by callers). Admins rename
-- and recolor; this becomes the single source of truth for status pills across
-- the dashboard, emails, Slack, WhatsApp.
--
-- Idempotent: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING.

create table if not exists status_settings (
  status         task_status primary key,
  label          text not null,
  color_token    text not null,
  display_order  int  not null,
  updated_at     timestamptz not null default now(),
  updated_by_id  uuid references employees(id) on delete set null
);

-- Seed values mirror the duplicated maps currently in
-- components/dashboard/status-distribution.tsx (LABELS + TONE) so the visual
-- output is unchanged the moment this migration applies.
insert into status_settings (status, label, color_token, display_order) values
  ('not_started', 'Not Started', 'amber',  10),
  ('initiated',   'Initiated',   'amber',  20),
  ('follow_up',   'Follow Up',   'amber',  30),
  ('need_help',   'Need Help',   'red',    40),
  ('done',        'Done',        'green',  50),
  ('approved',    'Approved',    'green',  60),
  ('not_approved','Not Approved','red',    70),
  ('cancelled',   'Cancelled',   'rose',   80),
  ('transferred', 'Transferred', 'purple', 90)
on conflict (status) do nothing;

------------------------------------------------------------------------
-- RLS — read by anyone authenticated, write admin-only, no insert/delete.
------------------------------------------------------------------------

alter table status_settings enable row level security;

drop policy if exists "status_settings_read_authenticated" on status_settings;
drop policy if exists "status_settings_write_admin"        on status_settings;

create policy "status_settings_read_authenticated"
  on status_settings for select
  to authenticated
  using (true);

create policy "status_settings_write_admin"
  on status_settings for update
  to authenticated
  using (app.is_admin())
  with check (app.is_admin());

revoke insert, delete on status_settings from authenticated;
revoke insert, delete on status_settings from anon;
