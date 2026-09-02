-- 0128 — Salary "Paid" mark. Super-admins (Manan/Hetesh) tick whether each
-- employee's salary for the month has been paid. Additive + idempotent. These
-- columns are NOT written by the sheet sync (breakup-sync only updates the
-- imported figures), so the paid mark survives every re-sync.

alter table salary_breakup
  add column if not exists paid boolean not null default false,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by_id uuid references employees(id) on delete set null;
