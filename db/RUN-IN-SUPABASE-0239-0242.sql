-- ============================================================================
--  RUN IN SUPABASE: 0239, 0240, 0241 and 0242, BEFORE deploying the code
--  that needs them (branch Vinal, 19 September 2026)
--
--  0239  WCC and MCC: how many were done, on a fill (completed_quantity)
--  0240  MCC frequencies: mcc_frequency, mcc_days, mcc_start_month
--  0241  WCC and MCC: the Doer Status Abandoned
--  0242  WCC: Mins, how long a compliance takes (minutes)
--
--  NOT the same files as 0240_incentive_entry_reversal, 0241_template_files
--  and 0242_two_step_verification on main. Those are separate migrations that
--  happen to share the numbers. Both sets are needed.
--
--  NEEDS 0238 FIRST (db/migrations/0238_wcc_mcc.sql), because 0241 changes the
--  doer_status rule that 0238 created. If 0238 has not run, this stops with an
--  error and changes nothing.
--
--  WHY BEFORE: the app writes every column the schema names, so until 0240 and
--  0242 run, adding a compliance on DCC, WCC or MCC fails, and so does the DCC
--  Master sync. The WCC and MCC pages themselves still open.
--
--  All four only ADD columns and rules. Safe to run twice. One transaction:
--  if any statement fails, nothing changes.
--
--  Press Ctrl+A before Run: the editor runs only the selected text.
--  Then run db/VERIFY-0239-0242.sql.
-- ============================================================================

BEGIN;

-- 0239  completed quantity
alter table dcc_entries add column if not exists completed_quantity integer;

alter table dcc_entries drop constraint if exists dcc_entries_completed_quantity_chk;
alter table dcc_entries add constraint dcc_entries_completed_quantity_chk
  check (completed_quantity is null or completed_quantity >= 0);

-- 0240  MCC frequencies
alter table dcc_kpi_items add column if not exists mcc_frequency text;
alter table dcc_kpi_items add column if not exists mcc_days smallint[];
alter table dcc_kpi_items add column if not exists mcc_start_month smallint;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_frequency_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_frequency_chk
  check (mcc_frequency is null
         or mcc_frequency in ('monthly', 'twice_monthly', 'thrice_monthly', 'alternate_month',
                              'quarterly', 'half_yearly', 'annually'));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_days_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_days_chk
  check (mcc_days is null
         or (cardinality(mcc_days) between 2 and 3 and 1 <= all(mcc_days) and 31 >= all(mcc_days)));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_start_month_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_start_month_chk
  check (mcc_start_month is null or mcc_start_month between 1 and 12);

-- 0241  Abandoned
alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done', 'abandoned'));

-- 0242  Mins
alter table dcc_kpi_items add column if not exists minutes integer;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_minutes_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_minutes_chk
  check (minutes is null or minutes between 1 and 1440);

COMMIT;
