-- Friendly sequential task number (#1042) shown across the app and searchable.
-- Backfilled in creation order; a sequence drives new inserts. Idempotent so
-- the apply-all-migrations runner can re-run it safely on every deploy.

-- 1. The column (nullable for now so the backfill can populate it).
alter table tasks add column if not exists task_no integer;

-- 2. Backfill existing rows in creation order. Start at 1000 so every task
--    reads as a tidy 4-digit number (oldest = #1000). Only touches rows that
--    don't have a number yet, so re-runs are no-ops.
with ordered as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from tasks
  where task_no is null
)
update tasks t
set task_no = o.rn + 999
from ordered o
where t.id = o.id;

-- 3. Sequence that assigns numbers to new tasks, starting just past the max
--    so it never collides with a backfilled value.
create sequence if not exists tasks_task_no_seq;
select setval(
  'tasks_task_no_seq',
  coalesce((select max(task_no) from tasks), 999) + 1,
  false
);
alter table tasks alter column task_no set default nextval('tasks_task_no_seq');
alter sequence tasks_task_no_seq owned by tasks.task_no;

-- 4. Enforce uniqueness + presence now that every row is numbered and new
--    inserts get the default.
create unique index if not exists tasks_task_no_uidx on tasks(task_no);
alter table tasks alter column task_no set not null;
