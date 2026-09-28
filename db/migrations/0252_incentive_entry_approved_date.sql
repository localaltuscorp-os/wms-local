-- Keep approval date as a real date alongside the existing entry/payment dates.
ALTER TABLE incentive_entries
  ADD COLUMN IF NOT EXISTS approved_date date;
