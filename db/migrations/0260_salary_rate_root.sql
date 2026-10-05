-- Freeze the calculation root on newly generated payroll runs.
-- Nullable fields preserve historical rows exactly; no backfill or repricing.
ALTER TABLE salary_runs
  ADD COLUMN IF NOT EXISTS monthly_salary numeric(14, 2),
  ADD COLUMN IF NOT EXISTS per_day_salary numeric(14, 2),
  ADD COLUMN IF NOT EXISTS working_hours_per_day numeric(8, 2);
