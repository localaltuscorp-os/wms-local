-- 0138 — HR confirmation reminders (dedupe for the probation/training-end nudge).
-- ADDITIVE + idempotent. One row per (employee, kind) ⇒ HR is reminded exactly
-- once that a probation / free-training period is ending.

create table if not exists hr_confirmation_reminders (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  kind text not null,               -- 'probation' | 'training'
  notified_at timestamptz not null default now()
);

create unique index if not exists hr_confirmation_reminders_uq
  on hr_confirmation_reminders (employee_id, kind);
