-- M4 — importer idempotency key + short-link slug for outbound notifications.
-- Both columns are nullable text + unique-indexed; short_id is backfilled
-- with the first 10 hex chars of the UUID (40 bits, URL-safe, birthday-
-- bound at ~1M tasks). UNIQUE constraint catches collisions; createTask
-- retries with a different slice on conflict.

alter table tasks
  add column if not exists legacy_import_key text,
  add column if not exists short_id          text;

-- Backfill short_id for every existing row.
update tasks
  set short_id = substr(replace(id::text, '-', ''), 1, 10)
  where short_id is null;

create unique index if not exists tasks_legacy_import_key_uidx
  on tasks(legacy_import_key)
  where legacy_import_key is not null;

create unique index if not exists tasks_short_id_uidx
  on tasks(short_id)
  where short_id is not null;
