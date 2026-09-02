-- 0091 — Durable Google Calendar sync state on tasks.
-- The previous sync was fire-and-forget inside after() with swallowed errors,
-- so a failure left no trace and no retry. These columns turn it into an
-- observable, retried reconciliation loop driven by a cron.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "calendar_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "calendar_next_attempt_at" timestamptz;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "calendar_last_sync_at" timestamptz;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "calendar_last_error" text;

-- The cron scans for retry-eligible rows; index the schedule column.
CREATE INDEX IF NOT EXISTS "tasks_calendar_next_attempt_idx"
  ON "tasks" ("calendar_next_attempt_at");
