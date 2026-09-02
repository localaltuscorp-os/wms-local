-- 0076 — #11 compulsory gates: per-employee daily task quota.
-- How many tasks this person must RECEIVE from their manager each working day.
-- Admin-configurable per employee (default 3; some are 5).
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "daily_task_quota" integer NOT NULL DEFAULT 3;
