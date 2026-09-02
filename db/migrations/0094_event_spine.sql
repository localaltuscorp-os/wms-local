-- 0094 — Phase B: the event spine (ARCHITECTURE.md, Laws 1-11).
--
-- ALL ADDITIVE. No existing table is altered. The operational DB stays the
-- source of truth (Law 1); these tables are the immutable event log, the
-- consumer cursors, the exactly-once command ledger, and the first rebuildable
-- projection. Nothing reads from them until a kill-switch is flipped, so this
-- migration is safe to apply to a live system with zero user-facing change.

-- ─────────────────────────────────────────────────────────────────────────
-- event_log — the transactional outbox AND the immutable business log in one
-- append-only table (Laws 2 + 3). Written IN THE SAME TRANSACTION as the
-- operational row (Law 2). Append-only + versioned + domain-owned (Law 3).
--
-- DELIBERATELY NO FOREIGN KEYS: events must outlive their aggregates. The
-- existing `task_events` table cascade-deletes with its task — that destroys
-- history and violates Law 3. This log never does. `seq` (bigserial) gives a
-- global total order so consumers can track an exact cursor position.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists event_log (
  seq            bigserial primary key,
  event_id       uuid not null default gen_random_uuid(),
  aggregate_type text not null,                    -- 'task' | 'goal' | 'attendance' | ...
  aggregate_id   uuid not null,
  event_type     text not null,                    -- 'TaskCreated' | 'TaskStatusChanged' | ...
  event_version  integer not null default 1,       -- Law 3: versioned; read via upcasters
  payload        jsonb not null default '{}'::jsonb,
  org_id         text,                             -- Law 11: tenancy seam (single-tenant → null today)
  correlation_id uuid,                             -- Law 9: one id per business workflow
  causation_id   uuid,                             -- the event that caused this one
  actor_id       uuid,                             -- who/what triggered it (no FK on purpose)
  occurred_at    timestamptz not null default now()
);
create index if not exists event_log_aggregate_idx on event_log (aggregate_type, aggregate_id, seq);
create index if not exists event_log_type_idx       on event_log (event_type, seq);
create index if not exists event_log_occurred_idx   on event_log (occurred_at);
create unique index if not exists event_log_event_id_uidx on event_log (event_id);

-- ─────────────────────────────────────────────────────────────────────────
-- event_consumers — at-least-once delivery cursor per consumer (Law 7).
-- The relay reads event_log WHERE seq > last_seq for each consumer, processes
-- each event idempotently, then advances last_seq. A consumer can be reset to
-- 0 to rebuild its projection from the full history (Law 4).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists event_consumers (
  consumer   text primary key,                     -- 'projection:task_metrics' | 'command:dispatcher'
  last_seq   bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- command_log — external side-effects on a separate, exactly-once channel
-- (Law 8). Commands are NEVER replayed: a replayed event derives the SAME
-- dedupe_key, the unique index rejects the duplicate (ON CONFLICT DO NOTHING),
-- so rebuilding a projection from history fires zero emails/calendar calls.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists command_log (
  id              uuid primary key default gen_random_uuid(),
  command_type    text not null,                   -- 'notify' | 'calendar_sync'
  dedupe_key      text not null,                   -- exactly-once key (unique)
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending', -- pending | sent | failed | terminal
  attempts        integer not null default 0,
  correlation_id  uuid,
  last_error      text,
  created_at      timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  sent_at         timestamptz
);
create unique index if not exists command_log_dedupe_uidx  on command_log (dedupe_key);
create index if not exists command_log_pending_idx on command_log (status, next_attempt_at);

-- ─────────────────────────────────────────────────────────────────────────
-- task_metrics_daily — the first projection (Laws 4, 5, 10). A rebuildable
-- daily rollup of task activity keyed by (event-day, doer). Derived ONLY from
-- task events; drop + replay event_log to rebuild it exactly. This is the
-- "materialize, don't scan" seam — a cheap point-read for per-doer activity
-- over time, available to dashboards and AI agents without scanning `tasks`.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists task_metrics_daily (
  day                date not null,
  doer_id            uuid not null,
  org_id             text,
  created_count      integer not null default 0,   -- tasks created that day (by event)
  done_count         integer not null default 0,   -- transitions INTO done that day
  approved_count     integer not null default 0,   -- transitions INTO approved that day
  not_approved_count integer not null default 0,    -- transitions INTO not_approved that day
  updated_at         timestamptz not null default now(),
  primary key (day, doer_id)
);
create index if not exists task_metrics_daily_day_idx on task_metrics_daily (day);
