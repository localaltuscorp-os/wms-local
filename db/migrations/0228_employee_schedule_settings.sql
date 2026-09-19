-- ════════════════════════════════════════════════════════════════════════════
-- EMPLOYEE-LEVEL SCHEDULE SETTINGS (0228)
--
-- Five settings that were policy-by-convention and are now per employee:
--
--   1. Is Attendance Applicable          Yes/No, default Yes
--   2. 1st–5th Saturday Working          Yes/No each, default Yes
--   3. Employee timings                  Mon–Fri and Saturday, start + end
--   4. Full-Time WFH allowed             Yes/No, default No
--   5. Part-Time WFH allowed             Yes/No, default No
--
-- ── EVERY DEFAULT REPRODUCES TODAY'S BEHAVIOUR EXACTLY ─────────────────────
-- This migration must be a no-op for all 27 existing employees on the day it
-- lands, because it runs against live attendance and salary data. So:
--
--   · attendance_applicable defaults TRUE — everybody punches today.
--   · sat1..sat5_working default TRUE — `WORKING_DAYS_PER_WEEK = 6` in
--     lib/attendance/effective-config.ts means Mon–Sat is already the week for
--     every day-graded worker, so "all five Saturdays work" IS the status quo.
--   · the Saturday times default NULL, and NULL means "same as Mon–Fri" rather
--     than "no Saturday schedule". A non-null value is an override; nobody has
--     one until an admin sets it, so nobody's grading moves.
--   · both WFH flags default FALSE, which is the current rule (there is no
--     per-employee WFH entitlement today).
--
-- NOT NULL with a default is safe here: Postgres 11+ rewrites this without a
-- table scan, and `employees` is 27 rows.
--
-- ── WHY MON–FRI REUSES THE EXISTING COLUMNS ────────────────────────────────
-- The brief asks for "Monday–Friday Start/End", and `att_official_start` /
-- `att_official_end` already hold exactly that value — they are what the Admin
-- Panel writes and what `resolveEffectiveConfig` reads as the PRIMARY input for
-- punctuality. Adding `mon_fri_start` beside them would give one concept two
-- columns, which is the precise bug the effective-config resolver was written
-- to fix (see its header: the panel wrote one pair, the engine read the other,
-- and a 19:00 checkout silently graded as an early leave).
--
-- So: Mon–Fri keeps the existing pair, and only SATURDAY gets new columns.
-- Existing data carries over untouched and there is no backfill to get wrong.
--
-- ── WHAT THIS MIGRATION DOES NOT TOUCH ─────────────────────────────────────
-- The 54 h/week target. `weekly_target_minutes` is untouched and the resolver
-- still derives 9 h × 6 for a full-timer. Timings define WHEN the scheduled
-- period is, never how long the week must add up to — that is the brief's own
-- rule and it is enforced in code, not here.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Is attendance applicable
------------------------------------------------------------------------
-- FALSE means this person is not required to punch at all. It is not an
-- exemption from a rule they are still measured against — the day ledger stops
-- treating their missing punches as absence, so no attendance deduction can be
-- computed from them. See `attendanceApplicable` in effective-config.ts.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS attendance_applicable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.attendance_applicable IS
  'FALSE = not required to punch; absence never counts against attendance or salary.';

------------------------------------------------------------------------
-- 2. Which Saturdays of the month are working days
------------------------------------------------------------------------
-- Five separate columns rather than a bitmask or an array, because the brief
-- asks for five independent Yes/No controls and this is the shape that reads
-- back as five checkboxes without any decoding. It is also the shape a SQL
-- report can filter on directly.
--
-- "1st Saturday" means the first Saturday BY DATE in that calendar month, which
-- is the ordinary reading and what `saturdayOrdinal()` implements.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sat1_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat2_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat3_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat4_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat5_working boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.sat1_working IS
  'Is the 1st Saturday of the month a working day for this employee?';

------------------------------------------------------------------------
-- 3. Saturday timings
------------------------------------------------------------------------
-- NULL = follow the Mon–Fri schedule (att_official_start / att_official_end).
-- Only a value set here makes Saturday differ, so the column being empty is
-- the same as it not existing — which is what keeps this migration inert.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sat_official_start time,
  ADD COLUMN IF NOT EXISTS sat_official_end   time;

COMMENT ON COLUMN employees.sat_official_start IS
  'Saturday start. NULL = same as the Mon-Fri att_official_start.';
COMMENT ON COLUMN employees.sat_official_end IS
  'Saturday end. NULL = same as the Mon-Fri att_official_end.';

-- A start after an end is a data-entry slip that would silently produce a
-- negative scheduled span downstream. Refuse it at the column rather than
-- defend against it in five callers. Both-null and both-set are the only
-- states the UI can produce; one-of-two is allowed and means "override just
-- that edge", so the constraint only fires when both are present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_sat_hours_ordered'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_sat_hours_ordered
      CHECK (
        sat_official_start IS NULL
        OR sat_official_end IS NULL
        OR sat_official_start < sat_official_end
      );
  END IF;
END $$;

------------------------------------------------------------------------
-- 4 & 5. Work-from-home entitlement
------------------------------------------------------------------------
-- Two independent flags, not one enum: the brief lists them as separate Yes/No
-- fields, and they are genuinely independent — somebody may be allowed the
-- occasional part-time WFH day without being allowed to work remotely full
-- time, and an always-remote hire is the reverse.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS wfh_full_time_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wfh_part_time_allowed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.wfh_full_time_allowed IS
  'May work from home full time.';
COMMENT ON COLUMN employees.wfh_part_time_allowed IS
  'May work from home part of the week.';
