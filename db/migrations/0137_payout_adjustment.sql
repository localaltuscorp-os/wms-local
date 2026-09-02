-- 0137 — Pre-payout manual adjustment (Sir #37). ADDITIVE + idempotent.
-- A SIGNED rupee amount added (+) / deducted (−) on a salary_breakup row before
-- the final take-home. Base final_payment is never mutated (reversible grant).

alter table salary_breakup
  add column if not exists payout_adjustment numeric(14,2) not null default 0;
alter table salary_breakup
  add column if not exists payout_adjustment_note text;
alter table salary_breakup
  add column if not exists payout_adjustment_at timestamptz;
alter table salary_breakup
  add column if not exists payout_adjustment_by_id uuid references employees(id) on delete set null;
