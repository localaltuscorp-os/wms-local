-- M2.1 — task_events: append-only per-task audit trail.
-- Idempotent: re-runnable.

create table if not exists task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  actor_id    uuid not null references employees(id) on delete restrict,
  event_type  text not null,
  from_value  jsonb,
  to_value    jsonb,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists task_events_task_created_idx
  on task_events(task_id, created_at desc);
create index if not exists task_events_actor_created_idx
  on task_events(actor_id, created_at desc);
create index if not exists task_events_created_idx
  on task_events(created_at desc);
