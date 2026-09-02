-- 0211 — salary_runs.target_hours: freeze the month's required hours on the run.
--
-- WHY. My Salary must show "Monthly target hours" for CLOSED months (spec §21,
-- 2026-08). The target is schedule-derived (holidays, weekly offs, leave all
-- move it), so recomputing it later would re-grade history against today's
-- calendar tables; freezing it at generation time — exactly like worked_hours
-- and hourly_rate already are (0177/0191) — keeps a closed payslip a record
-- rather than a formula.
--
-- Additive and nullable: rows generated before this column simply have NULL,
-- and every reader must render that as "unknown", never as 0 hours required.

ALTER TABLE salary_runs
  ADD COLUMN IF NOT EXISTS target_hours numeric(8, 2);
