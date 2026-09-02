-- 0182 — hr_form_submissions: constrain `status` to the two values the code and
-- the client renderer actually understand.
--
-- WHY A NEW FILE rather than amending 0181: 0181 is already recorded in
-- __schema_applied (it was applied out-of-band by
-- scripts/apply-0181-hr-form-submissions.ts against the live Supabase instance,
-- because 0169-0180 were still pending and running twelve unrelated migrations
-- to ship one feature was not a trade worth making). An edit to 0181 would
-- never re-run. New DDL always gets a new number.
--
-- WHY AT ALL: lib/hr/forms/schema.ts declares the column as
-- `.$type<HrFormStatus>()` — a compile-time CAST, not a database guarantee.
-- components/hr/forms/filled-forms-table.tsx does `STATUS_META[row.status]` and
-- reads `.color`/`.bg` off the result, so ONE row with an out-of-enum status is
-- a TypeError that blanks the entire Filled Forms table for everybody. The type
-- said "draft | submitted"; until now only the type said it. Anything writing
-- outside the zod path — the 0181 backfill, a manual fix-up, the next form to
-- join the registry — could put it wrong.

-- Fold any pre-existing stray value into the safe default first, or the ALTER
-- below cannot validate. `draft` is the right landing spot: it is the column
-- default, and treating an unrecognised status as "not yet submitted" errs
-- toward the employee still owing the form rather than claiming they filed it.
UPDATE hr_form_submissions
   SET status = 'draft'
 WHERE status NOT IN ('draft', 'submitted');

-- Idempotent: ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS in Postgres,
-- so guard on the catalogue the way a re-run would need.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_form_submissions_status_chk'
  ) THEN
    ALTER TABLE hr_form_submissions
      ADD CONSTRAINT hr_form_submissions_status_chk
      CHECK (status IN ('draft', 'submitted'));
  END IF;
END $$;
