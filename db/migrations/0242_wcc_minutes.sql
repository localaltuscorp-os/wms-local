-- 0242 — WCC: Mins (account holder, 2026-09-19).
--
-- "Insert Mins — I want to see total Compliance Mins also of all Dailys + all
-- Mondays + all Tuesdays etc. Remove Deadline, but add Mins."
--
-- How many minutes a compliance takes each time it is due. The Weekly
-- Compliance Checklist shows it in its Mins column, where Deadline was, and
-- adds it up for each group — all the Dailys of a day, all the Mondays, all
-- the Tuesdays… — and for the whole view (lib/compliance/minutes.ts).
--
--   minutes   a whole number of minutes, 1 to 1440. NULL = not set yet.
--
-- ADDITIVE and idempotent — this repository applies migrations by hand.
-- RUN IT BEFORE DEPLOYING: db/schema.ts names the column, so until it exists
-- every Drizzle insert into dcc_kpi_items (adding a compliance on DCC, WCC or
-- MCC, and the DCC Master sync) fails. The WCC and MCC pages themselves read
-- around a database without it.

alter table dcc_kpi_items add column if not exists minutes integer;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_minutes_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_minutes_chk
  check (minutes is null or minutes between 1 and 1440);
