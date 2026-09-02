-- WS-4 · Phase B1 — incentive 3-status split (Booked / Accrued / Paid).
--   Booked   = client made a PARTIAL payment
--   Accrued  = client paid in FULL
--   Paid     = we paid the employee (links to a salary payout run)
-- Additive + idempotent. Backfill sets accrued = approved so today's "approved"
-- figures become the accrued (client-paid-in-full) base with ZERO change to any
-- number. Inert until the engine reads the new columns (behind INCENTIVE_STATUS_OFF).

alter table incentive_entries
  add column if not exists booked_amt    numeric(14,2) not null default 0,
  add column if not exists accrued_amt   numeric(14,2) not null default 0,
  add column if not exists client_status text,
  add column if not exists payout_run_id uuid references salary_runs(id) on delete set null,
  add column if not exists paid_by_id    uuid references employees(id) on delete set null;

alter table incentive_projects
  add column if not exists emp_booked_amt     numeric(14,2) not null default 0,
  add column if not exists emp_accrued_amt    numeric(14,2) not null default 0,
  add column if not exists intern_booked_amt  numeric(14,2) not null default 0,
  add column if not exists intern_accrued_amt numeric(14,2) not null default 0,
  add column if not exists payout_run_id      uuid references salary_runs(id) on delete set null;

-- Backfill (guarded so re-running is a no-op): existing approved amounts become
-- the accrued base. Rows with approved = 0 stay accrued = 0 (correct).
update incentive_entries  set accrued_amt        = approved_amt        where accrued_amt = 0        and approved_amt <> 0;
update incentive_projects set emp_accrued_amt    = emp_approved_amt    where emp_accrued_amt = 0    and emp_approved_amt <> 0;
update incentive_projects set intern_accrued_amt = intern_approved_amt where intern_accrued_amt = 0 and intern_approved_amt <> 0;
