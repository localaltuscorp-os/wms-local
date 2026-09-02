-- 0191 — record overtime on a salary run.
--
-- WHY TWO NEW COLUMNS AND NOT A DERIVED FIGURE: a salary run is an AUDIT RECORD
-- of what somebody was actually paid. Re-deriving overtime later would read
-- today's attendance, today's schedule and today's rate — all of which move
-- after the fact (a punch edit, a leave approved late, a raise). The payslip has
-- to keep saying what it said the day it was issued, so the hours and the rupees
-- are frozen here alongside `worked_hours` / `hourly_rate`, which exist for the
-- same reason.
--
-- WHO EVER HAS A NON-ZERO VALUE: only the hourly-graded worker types — part-time
-- and afternoon/college shift (see `earnsOvertime` in lib/attendance/worker-type).
-- A full-timer's surplus hours stay CREDIT against a short week inside the same
-- month and never convert to money, so their rows keep the 0 default. Nullable
-- with a 0 default so every historical run reads as "no overtime" rather than
-- NULL-checking at every call site.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS) — this repo re-runs every migration on every
-- apply.

ALTER TABLE salary_runs
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(8,2) NOT NULL DEFAULT 0;

ALTER TABLE salary_runs
  ADD COLUMN IF NOT EXISTS overtime_amount numeric(14,2) NOT NULL DEFAULT 0;
