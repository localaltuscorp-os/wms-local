-- M2.1 — Task provenance + approval + optimistic-lock column.
-- Drizzle generated the column adds; we extend with backfill + index.
-- Idempotent: re-runnable.

alter table tasks
  add column if not exists created_by_id  uuid references employees(id) on delete restrict,
  add column if not exists approved_by_id uuid references employees(id) on delete set null,
  add column if not exists approved_at    timestamptz,
  add column if not exists approval_note  text,
  add column if not exists updated_at     timestamptz not null default now();

-- Backfill created_by_id from initiator_id (best proxy for historical rows).
update tasks set created_by_id = initiator_id where created_by_id is null;

create index if not exists tasks_created_by_idx on tasks(created_by_id);
