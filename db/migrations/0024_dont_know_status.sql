-- Manan 2026-05 — add the "Don't Know" task status (light grey). It sits
-- first in the lifecycle: "I haven't assessed this task yet".
--
-- NOTE: `alter type ... add value` cannot run inside a transaction block and
-- the new value can't be referenced in the same statement batch, so the
-- apply script (scripts/apply-dont-know.ts) runs the ADD VALUE on its own
-- connection/call first, then the rest below.
--
-- Idempotent: ADD VALUE IF NOT EXISTS + drop/create index + ON CONFLICT.

-- 1. (run separately by the apply script)
-- alter type task_status add value if not exists 'dont_know';

-- 2. Fold dont_know into the pending partial index so pending-task queries
--    stay index-backed.
drop index if exists tasks_pending_created_idx;
create index if not exists tasks_pending_created_idx
  on tasks (created_at)
  where status in (
    'dont_know','not_started','initiated','follow_up','need_help',
    'need_info','follow_up_1','follow_up_2','follow_up_3'
  );

-- 3. Seed the status_settings row so it's admin-editable + authoritative.
insert into status_settings (status, label, color_token, display_order)
values ('dont_know', 'Don''t Know', 'stone', 5)
on conflict (status) do nothing;
