-- 0238 — DCC becomes the Weekly and Monthly Compliance Checklists (WCC / MCC)
-- (account holder, 2026-09-18).
--
-- Built the way the Accounts checklists are: one row per compliance per
-- deadline, the WMS Doer Status, the actual date captured when it is marked
-- Done, the +/- days against the deadline, Doer Notes, and the WMS Approver
-- Status with Approver Notes.
--
-- The compliances themselves stay in dcc_kpi_items and each fill in
-- dcc_entries, so everything already in DCC — the position masters, the JD
-- "Add to DCC" push, four weeks of history — carries straight into WCC and MCC.
--   WCC  = schedule_kind 'scheduled' (due on its weekdays) and 'weekly'
--          (once a week, on any of its days)
--   MCC  = schedule_kind 'monthly', due on `month_day` (NULL = the month's end)
--
-- ADDITIVE. The old `status` column (Done / Not done / NA / Pending) is kept and
-- written alongside the new columns, because the DCC dashboard, the 10 pm
-- report, PMS and the Android app still read it. Idempotent — this repository
-- applies migrations by hand.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. MCC deadline: which day of the month a monthly compliance is due.
-- ───────────────────────────────────────────────────────────────────────────
alter table dcc_kpi_items add column if not exists month_day smallint;
alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_month_day_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_month_day_chk
  check (month_day is null or month_day between 1 and 31);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The WMS columns on every fill.
-- ───────────────────────────────────────────────────────────────────────────
-- doer_status  the WMS six: dont_know · not_started · initiated · follow_up ·
--              need_info · done
-- done_at      THE ACTUAL DATE, stamped by the server when the doer marks Done
-- approver_*   the WMS Approver Status (NULL = Pending) and its notes
alter table dcc_entries add column if not exists doer_status text;
alter table dcc_entries add column if not exists done_at timestamptz;
alter table dcc_entries add column if not exists approver_status text;
alter table dcc_entries add column if not exists approver_notes text;
alter table dcc_entries add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table dcc_entries add column if not exists approver_at timestamptz;

alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

alter table dcc_entries drop constraint if exists dcc_entries_approver_status_chk;
alter table dcc_entries add constraint dcc_entries_approver_status_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Carry the history across.
-- ───────────────────────────────────────────────────────────────────────────
--   Done     → done         (actual date: when the entry was last saved — the
--                            best record there is of when it was marked)
--   Pending  → initiated    (begun, not finished)
--   Not done → not_started
--   NA       → not_started, Approver Status "Cancelled" — WMS has no "Not
--              Applicable" doer status; work that did not apply is a ruling
update dcc_entries
   set doer_status = case status
                       when 'Done' then 'done'
                       when 'Pending' then 'initiated'
                       when 'Not done' then 'not_started'
                       when 'NA' then 'not_started'
                     end,
       done_at = case when status = 'Done' then coalesce(done_at, updated_at) else done_at end,
       approver_status = case when status = 'NA' then coalesce(approver_status, 'cancelled') else approver_status end
 where doer_status is null and status in ('Done', 'Pending', 'Not done', 'NA');

-- Manan Sir's grid and the 10 pm reminder read a whole team's fills for a
-- window of days at a time.
create index if not exists dcc_entries_item_date_idx on dcc_entries (item_id, entry_date);
