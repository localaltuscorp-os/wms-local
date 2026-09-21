-- 0221 — an optional NOTE on a holiday, and a record of who last changed it.
--
-- ── WHY THIS IS THE WHOLE MIGRATION ────────────────────────────────────────
-- Ad-hoc holidays already exist and already work. The `holidays` table has been
-- the calendar since migration 0009, `/hr/holidays` has had an ad-hoc panel
-- gated to Ruchita and Rutvisha, and `lib/queries/holidays.listHolidayDateSet`
-- already merges it into attendance grading — so declaring a day off already
-- shows up as a Holiday on everyone's attendance with no sync step.
--
-- Two things were genuinely missing against the brief:
--   1. the OPTIONAL NOTE ("Holiday name/reason, Date, Optional note"), and
--   2. an EDIT path — the HR panel could only add and remove, so correcting a
--      typo in a holiday's name meant deleting it and re-adding it, which
--      repriced the month twice and left two audit rows describing one fix.
--
-- This migration is the column the first needs, plus the two columns that let
-- an edit be attributed. The edit action itself is code.
--
-- No new table. There is one holiday calendar in the database and there must
-- not be a second.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The note
------------------------------------------------------------------------
-- NULLABLE and with no default. The brief says optional, and "optional" has to
-- mean the column can be absent rather than an empty string that every reader
-- then has to treat as absent anyway. The write path stores NULL for a blank
-- field, so there is one representation of "no note".
--
-- Deliberately NOT shown to employees on the public Holiday List: a note is
-- HR's own record of why a day was declared ("Ganpati visarjan — office shut at
-- client request"), and the company-facing calendar shows the holiday's NAME.
-- The HR panel that writes it is the surface that reads it back.

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS note text;

------------------------------------------------------------------------
-- 2. Who last changed it
------------------------------------------------------------------------
-- `created_by_id` and `created_at` already exist. An edit needs the other half,
-- or the row records who declared the holiday and says nothing about who
-- renamed or moved it — and moving a holiday changes the month's target hours
-- for everybody, which is exactly the kind of change that has to be
-- attributable.
--
-- The append-only trail in `employee_events` (`holiday_added` /
-- `holiday_removed`, now also `holiday_edited`) remains the history. These two
-- columns are the CURRENT state, so the admin screen can show "last changed by"
-- without joining the event log on every render.

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- DELIBERATELY NOT DEFAULTED to now(). A row that has never been edited must
-- read as never edited; defaulting would make every pre-existing holiday claim
-- it was changed the moment this migration ran.
