-- 0237 — The Event Checklist reads like WMS Tasks; a JD gets a Client and
-- per-person Doer Notes (account holder, 2026-09-18).
--
-- The checklist grid now runs in the WMS Tasks column order:
--   S. No. · Client · Subject · Task · Doer · Initiator · Target Date ·
--   Frequency · Doer Status · Doer Notes · Actual Date · +/- Days ·
--   Approver Status · Approver Notes
-- and a person's JD reads:
--   S. No. · Client · Subject · Job Description · Target Date · Doer Notes
--
-- "Category" becomes "Subject", picked from the same `subjects` roster WMS
-- Tasks uses (Admin Panel → Subjects). The column is NOT renamed: the stored
-- words are the same thing under a new heading, and a rename would break every
-- deployed reader until this ran.
--
-- ADDITIVE, apart from the Doer Status values below. Idempotent — this
-- repository applies migrations by hand, and a migration that cannot be run
-- twice gets run twice.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Checklist rows — Client, Initiator, and the repeat rule.
-- ───────────────────────────────────────────────────────────────────────────
alter table ops_checklist_items add column if not exists client text;
alter table ops_checklist_items add column if not exists initiator_id uuid
  references employees(id) on delete set null;
-- Google Calendar's RRULE (FREQ=WEEKLY;BYDAY=FR …), the same grammar a WMS
-- task's `recurrence_rule` holds. NULL = does not repeat. The Frequency column
-- (Daily / Weekly / Monthly / Quarterly / Yearly) is read from it, so the two
-- can never disagree.
alter table ops_checklist_items add column if not exists recurrence_rule text;

-- Whoever put a row on the checklist is who asked for it.
update ops_checklist_items
   set initiator_id = created_by_id
 where initiator_id is null and created_by_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Ticks — Approver Status and Approver Notes, beside the doer's own.
-- ───────────────────────────────────────────────────────────────────────────
-- NULL approver_status is "Pending" — no ruling yet — exactly as on a task.
alter table ops_checklist_checks add column if not exists approver_status text;
alter table ops_checklist_checks add column if not exists approver_notes text;
alter table ops_checklist_checks add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table ops_checklist_checks add column if not exists approver_at timestamptz;

alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_approver_chk;
alter table ops_checklist_checks add constraint ops_checklist_checks_approver_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Doer Status — the WMS Tasks six, replacing the checklist's own four.
-- ───────────────────────────────────────────────────────────────────────────
--   Pending        → not_started
--   Done           → done
--   Need Help      → need_info      (WMS retired need_help into need_info)
--   Not Applicable → not_started, with the Approver Status "Cancelled"
--
-- WMS has no "Not Applicable" doer status: work that did not need doing is a
-- RULING on the work, and Cancelled is that ruling. It keeps such rows out of
-- the progress figure the way Not Applicable did.
alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_status_chk;

update ops_checklist_checks
   set approver_status = coalesce(approver_status, 'cancelled'),
       status = 'not_started'
 where status = 'Not Applicable';

update ops_checklist_checks
   set status = case status
                  when 'Pending' then 'not_started'
                  when 'Done' then 'done'
                  when 'Need Help' then 'need_info'
                end
 where status in ('Pending', 'Done', 'Need Help');

alter table ops_checklist_checks alter column status set default 'not_started';
alter table ops_checklist_checks add constraint ops_checklist_checks_status_chk
  check (status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A Client on every Job Description — free text, like tasks.client, picked
--    from the `clients` roster.
-- ───────────────────────────────────────────────────────────────────────────
alter table jd_entries add column if not exists client text;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Doer Notes — what the PERSON doing a JD writes against it.
-- ───────────────────────────────────────────────────────────────────────────
-- Per person, not per JD: a seat's JD is shared by everyone in the seat, and
-- one holder's notes are not another's. Its own table rather than a column on
-- jd_assignments, because a person holds their seat's JDs without any
-- assignment row, and an assignment is retired and re-created as seats change —
-- the notes must survive both.
create table if not exists jd_doer_notes (
  jd_id uuid not null references jd_entries(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  notes text,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (jd_id, employee_id)
);

create index if not exists jd_doer_notes_employee_idx on jd_doer_notes (employee_id);
