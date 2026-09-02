-- 0100 — sync_runs: per-run audit trail for external-data sync jobs
-- (live salary-sheet mirror, historic attendance backfill, and any future
-- sheet→DB sync). One row per run: who/what triggered it, when it started and
-- finished, row counts, unmatched names, and the (truncated) error on failure.
--
-- SECURITY NOTE: this table stores COUNTS and NAMES only — never row contents
-- (salary figures are PII; the engines must not write them here or to logs).
--
-- Idempotent. Apply via a one-off tsx script (the drizzle journal is stale —
-- see project memory "Migration journal out of sync"), e.g. the runner inside
-- scripts/backfill-attendance.ts or a dedicated apply script:
--   pnpm tsx --env-file=.env.local scripts/apply-migration.ts db/migrations/0100_sync_runs.sql

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  -- Which engine ran: 'salary_breakup' | 'attendance_backfill' | future jobs.
  job text not null,
  -- What kicked it off: 'cron' | 'admin' | 'script'.
  trigger text not null,
  -- The acting admin for admin/script runs; null for cron.
  actor_id uuid references employees(id) on delete set null,
  -- True when the run only REPORTED changes (backfill dry-run) — no writes.
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- 'running' | 'ok' | 'error'
  status text not null default 'running',
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  rows_skipped integer not null default 0,
  -- Sheet names that matched no employee (report-don't-guess; name drift shows
  -- up here instead of silently creating duplicate salary_breakup rows).
  unmatched_names text[] not null default '{}'::text[],
  -- Error message truncated to 500 chars by the writer; never secrets/tokens.
  error text
);

create index if not exists sync_runs_job_started_idx on sync_runs (job, started_at desc);
create index if not exists sync_runs_status_idx on sync_runs (status) where status = 'error';
