-- WS-4 · Phase B3 — incentive_participants: generic N-way team split.
-- A participant row attaches to EITHER an incentive_entries row OR an
-- incentive_projects row (XOR, enforced), carrying that person's own
-- booked/accrued/paid share. Generalises the fixed supervisor+intern legs to N
-- people. Additive + idempotent; inert until CRUD lands (table empty on landing,
-- so the paid-producer fold falls through to the legacy legs unchanged).
create table if not exists incentive_participants (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid references incentive_entries(id) on delete cascade,
  project_id    uuid references incentive_projects(id) on delete cascade,
  period_month  date,
  emp_name      text not null,
  employee_id   uuid references employees(id) on delete set null,
  booked_amt    numeric(14,2) not null default 0,
  accrued_amt   numeric(14,2) not null default 0,
  paid_amt      numeric(14,2) not null default 0,
  paid_date     date,
  payout_run_id uuid references salary_runs(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint incentive_participants_parent_xor check (
    (entry_id is not null and project_id is null) or
    (entry_id is null and project_id is not null)
  )
);
create index if not exists incentive_participants_entry_idx    on incentive_participants (entry_id);
create index if not exists incentive_participants_project_idx  on incentive_participants (project_id);
create index if not exists incentive_participants_employee_idx on incentive_participants (employee_id);
create index if not exists incentive_participants_period_idx   on incentive_participants (period_month);
