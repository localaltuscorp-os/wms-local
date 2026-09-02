-- WS-3 / WS-4 · Phase B4 & C6 — salary_payments partial-payment ledger.
-- Records each actual disbursement (salary OR incentive) so amount_paid can be
-- tracked against amount_payable and an employee's account driven to nil.
-- `kind` separates salary vs incentive; incentive_entry_id soft-links the line.
-- Additive + idempotent; written only by the payments/payout flows (behind
-- SALARY_PAYMENTS_OFF / INCENTIVE_PAYOUT_OFF), so empty until those ship.
create table if not exists salary_payments (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid references employees(id) on delete set null,
  salary_run_id      uuid references salary_runs(id) on delete set null,
  month              text,                            -- 'YYYY-MM'
  kind               text not null default 'salary',  -- 'salary' | 'incentive'
  incentive_entry_id uuid references incentive_entries(id) on delete set null,
  amount             numeric(14,2) not null default 0,
  paid_date          date,
  method             text,
  note               text,
  created_by_id      uuid references employees(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists salary_payments_run_idx      on salary_payments (salary_run_id);
create index if not exists salary_payments_employee_idx on salary_payments (employee_id);
create index if not exists salary_payments_month_idx    on salary_payments (month);
