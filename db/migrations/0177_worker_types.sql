-- 0177 — Worker types: employment archetype + per-employee grading overrides +
-- non-CTC pay bases. All additive + idempotent; every existing employee stays
-- worker_type='full_time' so current grading + payroll are unchanged.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS worker_type text NOT NULL DEFAULT 'full_time';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS att_full_day_minutes integer;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS att_half_day_minutes integer;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekly_target_minutes integer;

ALTER TABLE salary_profiles ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'monthly_ctc';
ALTER TABLE salary_profiles ADD COLUMN IF NOT EXISTS monthly_pay_at_target numeric(14,2);
ALTER TABLE salary_profiles ADD COLUMN IF NOT EXISTS weekly_target_hours numeric(6,2);
ALTER TABLE salary_profiles ADD COLUMN IF NOT EXISTS monthly_fee numeric(14,2);

ALTER TABLE salary_runs ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'monthly_ctc';
ALTER TABLE salary_runs ADD COLUMN IF NOT EXISTS worked_hours numeric(8,2);
ALTER TABLE salary_runs ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);

ALTER TABLE salary_breakup ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'monthly_ctc';
ALTER TABLE salary_breakup ADD COLUMN IF NOT EXISTS worked_hours numeric(8,2);
