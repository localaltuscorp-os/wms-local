-- Phase 5.2 — recurrence materialization fields.
--
-- Adds two columns to `tasks`:
--   * recurrence_parent_id    — uuid, self-FK to tasks(id). NULL for
--                               originals (which act as the rule-holder
--                               AND the first occurrence). Set on every
--                               materialized child instance.
--   * recurrence_occurrence_date — date (yyyy-mm-dd) the child represents.
--                               NULL on originals.
--
-- A unique partial index on (parent_id, occurrence_date) is the dedup
-- guarantee — the materialization cron uses INSERT ... ON CONFLICT to
-- be safely re-runnable.
--
-- Idempotent.

alter table tasks
  add column if not exists recurrence_parent_id uuid references tasks(id) on delete set null;

alter table tasks
  add column if not exists recurrence_occurrence_date date;

-- Dedup: at most one instance per (parent, occurrence_date). Partial so
-- it doesn't touch the millions of non-recurring rows (we have ~710 today
-- but the index is cheaper this way regardless).
create unique index if not exists tasks_recurrence_dedup_idx
  on tasks(recurrence_parent_id, recurrence_occurrence_date)
  where recurrence_parent_id is not null
    and recurrence_occurrence_date is not null;

-- Pickup index for the materialization cron — it scans recurring template
-- rows (rule-holders only, i.e. recurrence_rule IS NOT NULL AND
-- recurrence_parent_id IS NULL).
create index if not exists tasks_recurrence_template_idx
  on tasks(recurrence_rule)
  where recurrence_rule is not null
    and recurrence_parent_id is null
    and archived = false;
