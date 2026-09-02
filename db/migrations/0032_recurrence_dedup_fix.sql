-- Phase 5.2 — fix: the partial unique index from 0031 can't be used as
-- an ON CONFLICT target without re-declaring the WHERE predicate at the
-- call site. Drop it and recreate as a plain unique index. Postgres'
-- UNIQUE treats NULL as distinct, so non-recurring rows (NULL,NULL) don't
-- conflict with each other.

drop index if exists tasks_recurrence_dedup_idx;

create unique index if not exists tasks_recurrence_dedup_idx
  on tasks(recurrence_parent_id, recurrence_occurrence_date);
