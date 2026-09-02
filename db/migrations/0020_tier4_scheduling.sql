-- Tier-4 (2026-05-20) — Manan asked for Google-Calendar-style scheduling
-- fields on every task. This is NOT Google Calendar API sync; it's just
-- internal metadata the team can use to plan when work happens.
--
--   starts_at / ends_at — explicit time block when the task lives on the
--                          calendar. Independent of `due_at` (deadline).
--   all_day            — when true, UI hides the time portion of
--                          starts_at/ends_at and shows "All day" badges.
--   recurrence         — repeat pattern token (text). Validated in app
--                          code against TASK_RECURRENCES; nullable, and
--                          NULL is treated as "none" (one-off task).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS starts_at   timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ends_at     timestamp with time zone,
  ADD COLUMN IF NOT EXISTS all_day     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence  text;

-- Index for the (likely-future) "tasks on a given day" calendar view.
-- Cheap to maintain; only a fraction of rows will have starts_at set.
CREATE INDEX IF NOT EXISTS tasks_starts_at_idx ON tasks (starts_at);
