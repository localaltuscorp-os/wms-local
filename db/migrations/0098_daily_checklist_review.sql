-- 0098 — Manager review of a team member's daily checklist.
-- ADDITIVE, idempotent. One review row per (employee, day): a manager marks a
-- day reviewed / approved / needs-rework with an optional note. The checklist
-- items themselves stay untouched (one source of truth) — this only records the
-- manager's decision ABOUT a day.
create table if not exists daily_checklist_reviews (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  plan_date    date not null,
  reviewer_id  uuid references employees(id) on delete set null,
  status       text not null default 'reviewed',   -- reviewed | approved | needs_rework
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, plan_date)
);
create index if not exists dcr_employee_date_idx on daily_checklist_reviews (employee_id, plan_date);
