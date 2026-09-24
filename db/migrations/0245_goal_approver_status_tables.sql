-- Restores the optional approver-status side tables for Goals.
--
-- Some existing databases predate migration 0231 but have later schema
-- changes recorded. These tables are read by the Goals board; no row means
-- the approver status is still Pending. This migration is additive and safe
-- to run where 0231 has already created the tables.

create table if not exists goal_approver_statuses (
  goal_id uuid primary key references goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists weekly_goal_approver_statuses (
  weekly_goal_id uuid primary key references weekly_goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);
