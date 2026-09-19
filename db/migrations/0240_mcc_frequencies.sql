-- 0240 — MCC frequencies (account holder, 2026-09-19).
--
-- The Monthly Compliance Checklist took one deadline a month. It now takes the
-- frequencies compliance work actually runs on:
--
--   Monthly · 2 times/month · 3 times/month · Alternate Month · Quarterly ·
--   Half Yearly · Annually
--
-- Every MCC compliance stays schedule_kind = 'monthly', which is what puts it
-- on MCC and keeps it out of DCC's daily counts; these columns say how often
-- within that (lib/compliance/mcc-frequency.ts):
--
--   mcc_frequency    the code — monthly, twice_monthly, thrice_monthly,
--                    alternate_month, quarterly, half_yearly, annually.
--                    NULL = monthly (every MCC compliance before this).
--   mcc_days         2 times/month and 3 times/month: each deadline day, in
--                    order (31 = the month's last day, as a 31st clamps).
--                    NULL otherwise — one deadline stays in month_day.
--   mcc_start_month  Alternate Month, Quarterly, Half Yearly, Annually: a month
--                    it is due in (1–12); the rest follow every 2, 3, 6 or 12
--                    months from it. NULL otherwise.
--
-- `frequency` (text) carries the label beside them, as it always has.
--
-- ADDITIVE and idempotent — this repository applies migrations by hand.
-- RUN IT BEFORE DEPLOYING: db/schema.ts names these columns, so until they
-- exist every Drizzle insert into dcc_kpi_items (adding a compliance on DCC,
-- WCC or MCC, and the DCC Master sync) fails. The WCC and MCC pages themselves
-- read around a database without them.

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
