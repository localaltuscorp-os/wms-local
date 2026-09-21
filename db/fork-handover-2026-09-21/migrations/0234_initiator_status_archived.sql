-- 0234 — "Archived" joins the Initiator Status verdicts, in WMS Tasks, Goals
-- and Projects (account holder, 2026-09-16).
--
-- The column was renamed in the UI at the same time: "Approver / Initiator
-- Status" is now just "Initiator Status". That is a label, not data — nothing
-- here renames anything.
--
--   Initiator Status  Pending · Approved · Not Approved · On Hold · Archived ·
--                     Cancelled        (Pending = no ruling = NULL)
--
-- The vocabulary and the rule for who may rule live in
-- lib/status/approver-status.ts.
--
-- Idempotent, and SAFE TO RUN BEFORE OR AFTER 0231: the two goal side tables
-- are only touched if they exist, so this does not fail on a database where
-- 0231 has not been applied yet. Apply 0231 first where you can — running this
-- one first simply leaves those two constraints for 0231 to create correctly.

-- ── TASKS ──────────────────────────────────────────────────────────────────
-- tasks.approval_status is a Postgres ENUM, so the value is added to the type.
-- (ADD VALUE cannot run inside a transaction block together with a statement
-- that uses the new value — run this file statement by statement, or apply
-- this line on its own first.)
alter type approval_status add value if not exists 'archived';

-- ── GOALS ──────────────────────────────────────────────────────────────────
-- Side tables from 0231, guarded by a CHECK rather than an enum. Widen it.
do $$
begin
  if to_regclass('public.goal_approver_statuses') is not null then
    alter table goal_approver_statuses
      drop constraint if exists goal_approver_statuses_approval_status_check;
    alter table goal_approver_statuses
      add constraint goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;

  if to_regclass('public.weekly_goal_approver_statuses') is not null then
    alter table weekly_goal_approver_statuses
      drop constraint if exists weekly_goal_approver_statuses_approval_status_check;
    alter table weekly_goal_approver_statuses
      add constraint weekly_goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;
end $$;

-- ── PROJECTS ───────────────────────────────────────────────────────────────
-- project_nodes.approval_status is text with a CHECK from 0204, which allows
-- exactly ('not_approved', 'approved', 'on_hold', 'cancelled'). This widens it
-- by one value.
--
-- NOT VALID, as 0204 wrote it. That is deliberate: 0204 never validated the
-- constraint, so rows older than it were never checked and may hold anything.
-- Adding a VALIDATING constraint here would scan the whole table and fail on
-- one such row — turning a one-word addition into a failed migration.
do $$
begin
  if to_regclass('public.project_nodes') is not null then
    alter table project_nodes
      drop constraint if exists project_nodes_approval_status_check;
    alter table project_nodes
      add constraint project_nodes_approval_status_check
      check (
        approval_status is null
        or approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled')
      ) not valid;
  end if;
end $$;
