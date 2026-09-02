-- 0136 — Attendance month freeze (Sir's rule 7). ADDITIVE + idempotent.
-- One row per frozen month ("YYYY-MM"): once the monthly statement's query window
-- closes (the 2nd), the month is frozen and its attendance can't be edited.

create table if not exists attendance_month_freeze (
  month text primary key,               -- 'YYYY-MM'
  frozen_at timestamptz not null default now(),
  frozen_by_id uuid references employees(id) on delete set null,
  note text
);
