-- 0060 Employee probation-end — additive, idempotent, no data touched.
-- Pulled forward from Phase C (salary) because Phase B's leave-cycle needs an
-- anchor date NOW: the paid-leave allowance accrues from probation-end and
-- nothing accrues before it. `probation_end` is a plain calendar date (the day
-- probation ends); null means "no probation anchor yet → 0 paid leaves".

ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_end date;
