-- 0209 — A remote-work request becomes a calendar entry: it has a start and an
-- end time, a repeat pattern, and a reason you can count.
--
-- ── TIMES (`all_day`, `start_time`, `end_time`) ────────────────────────────
-- 0205 stored a DATE and nothing else, so "I'm at the client from 2pm" and "I'm
-- at the client all day" were the same request. An approver could not tell them
-- apart, and neither could anyone reading the month back.
--
-- The times are stored EXPLICITLY even when `all_day` is true, rather than left
-- NULL and reconstituted from a constant at read time. A constant that changes
-- would silently rewrite the meaning of every historical row; stored times say
-- what was actually agreed on the day it was agreed. `all_day` is kept as well
-- because it is how the request was EXPRESSED — the UI needs to show "All day"
-- rather than "10:30 – 19:30", and those are the same fact stated at different
-- levels of detail.
--
-- BACKFILL: existing rows become all-day 10:30–19:30. That is not a guess —
-- before this migration a request could only ever mean a whole day, so writing
-- the whole day down is recording what they already said.
--
-- ── REPEAT (`recurrence`, `series_id`) ─────────────────────────────────────
-- The repeat pattern EXPANDS at submit time into one ordinary row per date.
-- It is deliberately NOT stored as a rule to be evaluated later:
--
--   · The unique index is (employee_id, work_date). One row per day is already
--     the shape the whole feature assumes.
--   · Approval is per-day. A manager must be able to approve Tuesday and refuse
--     Thursday, which a single rule row cannot express.
--   · The `attendance_logs` trigger from 0205 looks up an approved row FOR THAT
--     DATE. A stored rule would need the trigger to evaluate recurrence in
--     plpgsql, and any drift between that and the app's expansion becomes a
--     punch that is allowed in one place and refused in the other.
--
-- `series_id` is what makes the expansion reversible: it groups the generated
-- rows so the employee sees one series and an admin can drop the lot.
--
-- ── REASON BUCKET ──────────────────────────────────────────────────────────
-- Free text says what happened; the bucket says who initiated it. Both are kept
-- — the bucket is countable, the text carries the detail. Nullable, because
-- every existing row predates the question and a default would answer it on
-- their behalf.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply.

ALTER TABLE remote_work_requests
  ADD COLUMN IF NOT EXISTS all_day    boolean NOT NULL DEFAULT true;
ALTER TABLE remote_work_requests
  ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE remote_work_requests
  ADD COLUMN IF NOT EXISTS end_time   time;

-- Record what the pre-0209 rows already meant, then make the columns required.
UPDATE remote_work_requests SET start_time = '10:30' WHERE start_time IS NULL;
UPDATE remote_work_requests SET end_time   = '19:30' WHERE end_time   IS NULL;

ALTER TABLE remote_work_requests ALTER COLUMN start_time SET DEFAULT '10:30';
ALTER TABLE remote_work_requests ALTER COLUMN end_time   SET DEFAULT '19:30';
ALTER TABLE remote_work_requests ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE remote_work_requests ALTER COLUMN end_time   SET NOT NULL;

ALTER TABLE remote_work_requests
  ADD COLUMN IF NOT EXISTS reason_bucket text;
ALTER TABLE remote_work_requests
  ADD COLUMN IF NOT EXISTS recurrence    text NOT NULL DEFAULT 'none';
ALTER TABLE remote_work_requests
  ADD COLUMN IF NOT EXISTS series_id     uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'remote_work_requests_time_chk'
  ) THEN
    -- Strictly increasing: a zero-length day is not a request, and an end before
    -- its start is a typo that would otherwise be stored and approved.
    ALTER TABLE remote_work_requests ADD CONSTRAINT remote_work_requests_time_chk
      CHECK (end_time > start_time);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'remote_work_requests_bucket_chk'
  ) THEN
    ALTER TABLE remote_work_requests ADD CONSTRAINT remote_work_requests_bucket_chk
      CHECK (reason_bucket IS NULL
             OR reason_bucket IN ('manan_approved', 'client_requested', 'manager_approved'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'remote_work_requests_recurrence_chk'
  ) THEN
    ALTER TABLE remote_work_requests ADD CONSTRAINT remote_work_requests_recurrence_chk
      CHECK (recurrence IN ('none', 'daily', 'weekdays', 'weekly', 'custom'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS remote_work_requests_series_idx
  ON remote_work_requests (series_id) WHERE series_id IS NOT NULL;
