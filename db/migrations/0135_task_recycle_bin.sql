-- 0135 — Recycle Bin: "abandon" a task from the daily loop. ADDITIVE + idempotent.
-- An abandoned task leaves the plan sources + task lists and sits in a manager
-- Recycle Bin, which can restore it (clear abandoned_at) or permanently delete it.

alter table tasks
  add column if not exists abandoned_at timestamptz;

alter table tasks
  add column if not exists abandoned_by_id uuid references employees(id) on delete set null;

-- Fast "recycle bin" scan (abandoned rows only — partial index stays tiny).
create index if not exists tasks_abandoned_idx
  on tasks (abandoned_at)
  where abandoned_at is not null;
