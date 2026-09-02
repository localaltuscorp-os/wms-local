-- Phase 2.1 — Notification dispatch logging + retry.
--
-- Today every channel arm in lib/notifications/dispatch.ts swallows
-- failures into `safeSend`, so the only record of a failed Slack/email/
-- WhatsApp send is a console.error in Vercel logs nobody reads. People
-- silently miss task assignments. This table is the audit trail: one
-- row per (notification, channel) attempt, with retry metadata so a
-- cron can pick up `failed` rows and re-run them up to 3 times.
--
-- Idempotent.

create table if not exists notification_dispatch_log (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  -- 'email' | 'slack' | 'whatsapp' | 'web_push'
  channel         text not null,
  -- 'sent' (delivered), 'skipped' (channel disabled / opt-out / no contact),
  -- 'failed' (transient error — retry-eligible),
  -- 'failed_terminal' (gave up after max attempts).
  status          text not null,
  error_message   text,
  attempt_count   integer not null default 1,
  attempted_at    timestamptz not null default now(),
  -- When status='failed', the earliest time the retry cron should try
  -- this row again. NULL for sent/skipped/failed_terminal rows.
  next_attempt_at timestamptz,
  updated_at      timestamptz not null default now()
);

-- Pickup index for the retry cron: scan rows where status='failed' AND
-- next_attempt_at <= now() AND attempt_count < 3, ordered by oldest first.
create index if not exists notification_dispatch_log_retry_idx
  on notification_dispatch_log(next_attempt_at, attempt_count)
  where status = 'failed';

-- Audit/inspection index.
create index if not exists notification_dispatch_log_notification_idx
  on notification_dispatch_log(notification_id, channel, attempted_at desc);

-- RLS — admins can read for the integrations dashboard; nobody writes
-- via PostgREST. The app writes as the DB owner (bypasses RLS).
alter table notification_dispatch_log enable row level security;

drop policy if exists "ndl_read_admin" on notification_dispatch_log;
create policy "ndl_read_admin"
  on notification_dispatch_log for select
  to authenticated
  using (app.is_admin());

revoke insert, update, delete on notification_dispatch_log from authenticated, anon;
