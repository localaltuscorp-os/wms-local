-- Google Calendar sync (per-user OAuth).
--
-- Doers connect their own Google account once; we store the long-lived
-- refresh token and, on each task save, create an event on their calendar.
-- The task remembers the event id + which doer's calendar holds it so edits,
-- deletes and reassignments can keep the calendar in sync.
--
-- Idempotent: add-column-if-not-exists.

alter table employees
  add column if not exists google_refresh_token text,
  add column if not exists google_email         text,
  add column if not exists google_connected_at  timestamptz;

alter table tasks
  add column if not exists google_event_id        text,
  add column if not exists google_synced_doer_id  uuid;

-- Fast lookup of synced tasks for a given doer (used when reassigning).
create index if not exists tasks_google_event_idx
  on tasks(google_synced_doer_id) where google_event_id is not null;
