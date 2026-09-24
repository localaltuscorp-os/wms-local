-- 0252 — full Google-Calendar-style recurrence on exec_calendar_routines.
-- Additive + idempotent. Nothing is dropped and no existing row is touched.
--
-- `days_of_week` + `from_date`/`to_date` alone already say "Daily", "Weekly on
-- these days" and "Every weekday" correctly — every routine stamped before
-- this migration keeps meaning exactly what it always meant, with these three
-- columns NULL. Only Monthly, Yearly, "every N weeks/months" and a
-- occurrence-count end need more than that; `recurrence_rule` (an RRULE-lite
-- string, lib/recurrence/rrule.ts) becomes the source of truth for a routine
-- once one of those is chosen, and `interval`/`count` are split out as their
-- own columns purely so the "Edit a Routine" list can show them without
-- re-parsing the rule string.
ALTER TABLE exec_calendar_routines ADD COLUMN IF NOT EXISTS interval integer;
ALTER TABLE exec_calendar_routines ADD COLUMN IF NOT EXISTS count integer;
ALTER TABLE exec_calendar_routines ADD COLUMN IF NOT EXISTS recurrence_rule text;
