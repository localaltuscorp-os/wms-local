-- Migration 0133 — Salary "Wave-Off" (condone attendance days). ADDITIVE, load-neutral.
-- Idempotent: safe to re-run.
--   pnpm tsx --env-file=.env.local scripts/apply-0133-salary-waiveoff.ts
--
-- Super-admin GRANT (not a raw-amount edit): the super-admin types how many
-- DAYS to condone for a person; the salary view adds those days back at the
-- per-day rate (monthly_ctc / days_in_month), reducing the attendance
-- deduction ("your money isn't deducted"). Purely additive to the DISPLAYED
-- net — the imported base amounts (payable_after_pt / final_payment) are never
-- mutated. Mirrors the paid / admin_note columns: NOT touched by the sheet
-- sync, so it survives re-syncs.

alter table salary_breakup
  add column if not exists waive_off_days numeric(6,2) not null default 0;
alter table salary_breakup
  add column if not exists waive_off_note text;
alter table salary_breakup
  add column if not exists waive_off_at timestamptz;
alter table salary_breakup
  add column if not exists waive_off_by_id uuid references employees(id) on delete set null;
