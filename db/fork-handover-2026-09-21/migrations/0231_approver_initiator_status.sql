-- 0231 — Approver / Initiator Status beside Doer Status, in WMS Tasks, Goals
-- and Projects (account holder, 2026-09-15).
--
-- Every piece of work now carries two statuses:
--   Doer Status                  Not Read · Not Started · Initiated · Follow Up ·
--                                Need Info · Done
--   Approver / Initiator Status  Pending · Approved · Not Approved · On Hold ·
--                                Cancelled      (Pending = no ruling = NULL)
-- The vocabulary and the rule for who may rule live in
-- lib/status/approver-status.ts.
--
-- Idempotent: this repository applies migrations by hand.

-- ── TASKS ──────────────────────────────────────────────────────────────────
-- On Hold becomes a ruling. tasks.approval_status gains the value.
-- (ADD VALUE cannot run inside a transaction block together with a statement
-- that uses the new value — run this file statement by statement, or apply
-- this line on its own first.)
alter type approval_status add value if not exists 'on_hold';

-- ── GOALS ──────────────────────────────────────────────────────────────────
-- A SIDE TABLE, not a column on goals / weekly_goals: much of the Goals module
-- reads those tables with a bare `select()` / `returning()`, which name every
-- declared column — a new column there would break the whole module until this
-- migration had run. No row = Pending.
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

-- ── PROJECTS ───────────────────────────────────────────────────────────────
-- project_nodes.approval_status already exists (0204) with exactly these
-- values; nothing to add.
