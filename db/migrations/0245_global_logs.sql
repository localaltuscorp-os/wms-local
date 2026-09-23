-- ════════════════════════════════════════════════════════════════════════════
-- GLOBAL WMS LOGS (0245) — the append-only activity log + daily activity sessions
--
-- WHAT THIS IS
--   An immutable, server-authoritative record of activity across the whole WMS:
--   login/logout/session lifecycle, module & page visits, record views,
--   creates/updates/deletes, approvals/rejections/reversals, exports, searches,
--   filters, access-denied attempts and configuration changes. It backs
--   Admin Panel → Logs.
--
-- TWO TABLES, TWO JOBS
--   daily_sessions  — one row per employee per IST calendar date. A rollup of
--                     the day's activity (first login, last activity, logout,
--                     counters, estimated minutes). System-writable only.
--   activity_logs   — the log itself. Append-only; enforced by a trigger.
--
-- SAFETY
--   Additive + idempotent. Every statement is `if not exists` / guarded.
--   The ONLY destruction is `drop trigger if exists` + `drop function if exists`
--   before recreating them (a trigger has no data). No DROP TABLE, no DELETE,
--   no TRUNCATE.
--
-- NAMING NOTE
--   The brief's activity_logs field called `timestamp` is stored as `event_at`
--   because `timestamp` is an SQL reserved word that would need quoting at every
--   call site. The UI column is labelled "Time".
-- ════════════════════════════════════════════════════════════════════════════

-- ── DAILY SESSIONS ──────────────────────────────────────────────────────────
create table if not exists daily_sessions (
  id                       uuid primary key default gen_random_uuid(),
  employee_id              uuid not null references employees (id) on delete cascade,
  date_ist                 date not null,
  first_login_at           timestamptz,
  last_activity_at         timestamptz,
  logout_at                timestamptz,
  logout_type              text,
  total_estimated_minutes  integer not null default 0,
  total_event_count        integer not null default 0,
  modules_visited_count    integer not null default 0,
  pages_visited_count      integer not null default 0,
  records_viewed_count     integer not null default 0,
  actions_performed_count  integer not null default 0,
  status                   text not null default 'active',
  finalized_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint daily_sessions_logout_type_chk
    check (logout_type is null or logout_type in
      ('NORMAL', 'INACTIVITY_TIMEOUT', 'SESSION_EXPIRED', 'FORCED_LOGOUT', 'NOT_RECORDED')),
  constraint daily_sessions_status_chk
    check (status in ('active', 'closed', 'finalized'))
);

create unique index if not exists daily_sessions_employee_date_uq
  on daily_sessions (employee_id, date_ist);
create index if not exists daily_sessions_date_status_idx
  on daily_sessions (date_ist, status);

-- ── ACTIVITY LOGS ───────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id                uuid primary key default gen_random_uuid(),
  daily_session_id  uuid references daily_sessions (id) on delete set null,
  -- Nullable on purpose: a LOGIN_FAILED for an unknown email and pure SYSTEM
  -- events have no employee row to point at. Everything a real user did has one.
  employee_id       uuid references employees (id) on delete set null,
  event_at          timestamptz not null default now(),
  event_type        text not null,
  module            text,
  page              text,
  route             text,
  resource_type     text,
  resource_id       text,
  resource_name     text,
  action            text,
  status            text,
  reason            text,
  changes           jsonb,
  metadata          jsonb,
  request_id        text,
  operation_id      text,
  -- Idempotent-ingest dedupe key, minted on the client. A replayed batch that
  -- repeats this id is a no-op (the unique index rejects it).
  client_event_id   text,
  actor_type        text,
  created_at        timestamptz not null default now()
);

create index if not exists activity_logs_employee_event_idx
  on activity_logs (employee_id, event_at desc);
create index if not exists activity_logs_session_idx
  on activity_logs (daily_session_id);
create index if not exists activity_logs_event_at_idx
  on activity_logs (event_at desc);
create index if not exists activity_logs_module_event_idx
  on activity_logs (module, event_at desc);
create index if not exists activity_logs_event_type_event_idx
  on activity_logs (event_type, event_at desc);
create index if not exists activity_logs_status_event_idx
  on activity_logs (status, event_at desc);
create index if not exists activity_logs_resource_idx
  on activity_logs (resource_type, resource_id);
create index if not exists activity_logs_request_id_idx
  on activity_logs (request_id);
create index if not exists activity_logs_operation_id_idx
  on activity_logs (operation_id);
create index if not exists activity_logs_module_page_event_idx
  on activity_logs (module, page, event_at desc);
create unique index if not exists activity_logs_client_event_id_uq
  on activity_logs (client_event_id)
  where client_event_id is not null;

-- ── IMMUTABILITY ────────────────────────────────────────────────────────────
-- The log is append-only. No application code may UPDATE or DELETE a row; this
-- trigger makes that true at the database level, so even a bug or a direct SQL
-- write is refused. Corrections, if ever needed, are a separate system-level
-- process — never normal WMS functionality.
create or replace function activity_logs_no_mutate() returns trigger as $$
begin
  raise exception 'activity_logs is append-only (no UPDATE, no DELETE)';
end;
$$ language plpgsql;

drop trigger if exists activity_logs_no_mutate on activity_logs;
create trigger activity_logs_no_mutate
  before update or delete on activity_logs
  for each row execute function activity_logs_no_mutate();
