-- 0263 — Multi-date MCC schedules.
--
-- Adds the explicitly supported four-date Monthly, Quarterly and Half Yearly
-- variants used by Employees → Compliance Checklist. The schedule remains in
-- the existing MCC columns; no compliance rows are rewritten.

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_frequency_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_frequency_chk
  check (mcc_frequency is null
         or mcc_frequency in ('monthly', 'twice_monthly', 'thrice_monthly',
                              'four_times_monthly', 'alternate_month',
                              'quarterly', 'quarterly_multiple',
                              'half_yearly', 'half_yearly_multiple', 'annually'));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_days_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_days_chk
  check (mcc_days is null
         or (cardinality(mcc_days) between 2 and 4
             and 1 <= all(mcc_days) and 31 >= all(mcc_days)));
