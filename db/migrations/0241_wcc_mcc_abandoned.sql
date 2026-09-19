-- 0241 — WCC / MCC: the Doer Status "Abandoned" (account holder, 2026-09-19).
--
-- The Doer Status on a WCC / MCC fill is the WMS six — Not Read, Not Started,
-- Initiated, Follow Up, Need Info, Done — and now Abandoned: the doer has
-- given the compliance up. It is WCC / MCC's own; WMS Tasks are unchanged.
-- The old `status` column written beside it reads "Not done", so DCC's own
-- readers (the 10 pm report, the dashboard, the Android app) see what they
-- always saw for work that was not done.
--
-- Additive and idempotent — this repository applies migrations by hand. Until
-- it has run, picking Abandoned is refused by the old check; nothing else is.

alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done', 'abandoned'));
