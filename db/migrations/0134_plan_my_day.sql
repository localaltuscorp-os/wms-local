-- 0134 — Unified "Plan My Day": merge Daily Checklist into the drag-drop planner.
-- ADDITIVE + idempotent.
--   1. daily_checklist.done_pct — optional 0-100% close-out progress per item
--      (alongside the existing boolean `done`; NULL + done ⇒ treat as 100%).
--   2. daily_plan_day — per employee-day plan lifecycle: started (morning commit)
--      → closed (end-of-day close-out). Drives which phase the page shows.

alter table daily_checklist
  add column if not exists done_pct integer;

create table if not exists daily_plan_day (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  plan_date date not null,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_plan_day_emp_date_uq
  on daily_plan_day (employee_id, plan_date);
