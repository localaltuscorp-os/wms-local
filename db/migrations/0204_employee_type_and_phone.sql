-- 0204 — Employee Type taxonomy + a real phone number.
--
-- ── PART 1: WORKER TYPE → EMPLOYEE TYPE ────────────────────────────────────
-- The Admin Panel now calls this field "Employee Type" and offers Full Time /
-- First Half / Second Half / Hybrid. Two of those already existed under names
-- that described the ROSTER rather than the person:
--
--     afternoon_shift  ->  second_half      4 employees
--     part_time        ->  hybrid           1 employee
--
-- Both are PURE RENAMES. Every downstream rule travels with them unchanged —
-- `second_half` keeps monthly-CTC pay with the hourly-shift day (4.5h/27h and
-- overtime), and `hybrid` keeps hourly pay with hours-based grading. That last
-- one matters more than its single row suggests: that employee is the ONLY
-- `hourly` pay_type in the system, and a rename that quietly moved them onto a
-- monthly basis would change what they are paid.
--
-- `first_half` is new and has no employees yet. It is the mirror of
-- `second_half` — same short day, same week, same overtime eligibility — so the
-- morning shift stops having to be recorded as an afternoon one.
--
-- `project_remote` is DELIBERATELY LEFT IN PLACE. It has no employees, but it
-- still has code: the Work Sessions feature grades it by session
-- (`gradingModeFor`), and `lib/queries/work-sessions.ts` and the work-session
-- actions read it. Dropping the value would break that feature to tidy a
-- dropdown. It is simply no longer offered in the Employee Type picker.
--
-- There is no CHECK constraint on this column and no enum type — it is plain
-- text validated in the application — so a rename is exactly these two UPDATEs.
--
-- ── PART 2: A PHONE NUMBER THAT IS NOT THE WHATSAPP NUMBER ────────────────
-- `employees` carried only `whatsapp_phone`, so "call this person" and "message
-- this person on WhatsApp" were forced to be the same number. They frequently
-- are not. Nullable with no backfill: seeding it from `whatsapp_phone` would
-- assert a fact nobody entered, and a wrong phone number is worse than a blank
-- one.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply. The
-- UPDATEs are naturally idempotent (the old values cease to exist after the
-- first run) and the ADD COLUMN is guarded.

UPDATE employees SET worker_type = 'second_half' WHERE worker_type = 'afternoon_shift';
UPDATE employees SET worker_type = 'hybrid'      WHERE worker_type = 'part_time';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS phone text;
