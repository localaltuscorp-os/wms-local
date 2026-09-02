-- ECOS Phase 2 + 3 — segments, scheduling/recurrence, polls, reminders, templates.
-- Idempotent (safe to re-run). Additive only — no live behaviour changes until
-- the Phase-2 code ships. See lib/ecos/*.

-- ── Saved audiences (named segments) ──────────────────────────────────────
create table if not exists broadcast_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule jsonb not null,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Scheduling + recurrence on broadcasts ─────────────────────────────────
-- scheduled_for already exists (0179). status may be 'scheduled'.
alter table broadcasts add column if not exists recurrence text not null default 'none';       -- none|daily|weekly|monthly
alter table broadcasts add column if not exists recurrence_until date;                          -- inclusive stop date (null = open)
alter table broadcasts add column if not exists last_run_at timestamptz;                        -- last time a scheduled/recurring run fired

-- ── Reminders / escalation policy ─────────────────────────────────────────
alter table broadcasts add column if not exists reminder_after_days integer;                    -- null = reminders off
alter table broadcasts add column if not exists escalate_to_manager boolean not null default false;
alter table broadcast_recipients add column if not exists last_reminded_at timestamptz;
alter table broadcast_recipients add column if not exists reminder_count integer not null default 0;

-- ── Poll / quiz attached to a broadcast ───────────────────────────────────
-- poll jsonb = { question, options: string[], mode: 'poll'|'quiz', correctIndex?: number, anonymous?: boolean }
alter table broadcasts add column if not exists poll jsonb;
create table if not exists broadcast_poll_responses (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  option_index integer not null,
  created_at timestamptz not null default now(),
  unique (broadcast_id, employee_id)
);
create index if not exists broadcast_poll_responses_bid_idx on broadcast_poll_responses (broadcast_id);

-- ── Reusable broadcast templates ──────────────────────────────────────────
create table if not exists broadcast_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '',
  body_html text not null default '',
  category text not null default 'announcement',
  priority text not null default 'normal',
  ack_mode text not null default 'read',
  channels jsonb not null default '["in_app","email"]'::jsonb,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcasts_scheduled_idx on broadcasts (status, scheduled_for);
