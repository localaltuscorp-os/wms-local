-- WS-4 · Phase B4 — incentive payout audit spine.
-- One immutable row per payout of incentive money to an employee, linked to the
-- salary run it was paid alongside (unified "pay incentives from the same place
-- as salary" flow). Additive + idempotent; written only by the payout txn
-- (behind INCENTIVE_PAYOUT_OFF), so empty until that ships.
create table if not exists incentive_payout_events (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid references employees(id) on delete set null,
  emp_name      text,
  source        text not null,                 -- 'entry' | 'project' | 'participant'
  source_id     uuid,                          -- the incentive_* row paid
  salary_run_id uuid references salary_runs(id) on delete set null,
  period_month  date,
  amount        numeric(14,2) not null default 0,
  paid_date     date,
  created_by_id uuid references employees(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists incentive_payout_events_employee_idx on incentive_payout_events (employee_id);
create index if not exists incentive_payout_events_run_idx      on incentive_payout_events (salary_run_id);
create index if not exists incentive_payout_events_period_idx   on incentive_payout_events (period_month);
