-- Task read-receipt: first_read_at is set the first time ANY user opens the
-- task's detail page. Powers the "Not Read" stat card (pending tasks with a
-- null first_read_at). Existing tasks are backfilled to created_at so they
-- count as already-read and the card starts near zero.
--
-- Idempotent: add-column-if-not-exists + NULL-guarded backfill.

alter table tasks
  add column if not exists first_read_at timestamptz;

update tasks
set first_read_at = created_at
where first_read_at is null;
