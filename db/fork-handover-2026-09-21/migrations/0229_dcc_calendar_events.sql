-- 0229 — Daily Compliance in every employee's Google Calendar.
--
-- The account holder asked (2026-09-15) for every DCC entry to sit in each
-- employee's Altus Google Calendar. lib/dcc/calendar-sync.ts keeps ONE all-day
-- event per person per day; this table remembers which Google event that is and
-- what was last sent, so an unchanged day costs no API call and a changed one is
-- updated in place instead of duplicated.
--
--   google_event_id  null once the day's event has been removed
--   synced_hash      fingerprint of the event body last sent
--   snapshot_at      when the data behind that sync was read — a slower sync
--                    that read older data never overwrites a newer one
--   last_error       the last Google failure, retried by the next run
--
-- A new table rather than columns on `employees` or `dcc_entries`: the event is
-- per person-DAY, which neither of those rows is.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists dcc_calendar_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  event_date date not null,
  google_event_id text,
  synced_hash text,
  snapshot_at timestamptz,
  synced_at timestamptz,
  last_error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_calendar_events_uq
  on dcc_calendar_events (employee_id, event_date);
