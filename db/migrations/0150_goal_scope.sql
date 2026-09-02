-- 0150 — Personal | Professional goal scope. ADDITIVE + idempotent.
-- Every goal belongs to a `scope`: the existing module is 'professional'
-- (default → all current rows), and admins get a private 'personal' space with
-- its own Yearly→Daily goals. Personal goals live ONLY in this table (never
-- weekly_goals / daily_checklist), so attendance/plan gates are untouched.

alter table goals
  add column if not exists scope text not null default 'professional';

create index if not exists goals_emp_scope_period_idx
  on goals (employee_id, scope, period, period_key);
