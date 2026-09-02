-- 0203 — let CANDIDATE-stage forms into the HR submissions index.
--
-- THE PROBLEM: `hr_form_submissions` keys every row to `employee_id NOT NULL`.
-- Four of the HR module's forms — Candidate Intake, Evaluation v1, Evaluation v2
-- and the Management Assessment — are filled BEFORE the person is an employee.
-- They live on `candidate_intake`, which has no employee_id and never will while
-- the candidate is still a candidate. So those four could not be indexed at all,
-- and HR Record / All Forms / My Forms were structurally blind to them.
--
-- THE SHAPE: one row still describes one filled form, but its SUBJECT is now
-- either an employee or a candidate — exactly one of the two, enforced by
-- `hr_form_submissions_subject_chk` rather than by every caller remembering.
-- Making employee_id nullable without that CHECK would allow a row belonging to
-- nobody, which is worse than the problem being fixed: it would render in the
-- lists with an empty name and no way to trace it back.
--
-- WHY A SECOND UNIQUE INDEX AND NOT A WIDER ONE: Postgres treats NULLs as
-- DISTINCT in a unique index, so once employee_id can be NULL the existing
-- `hr_form_submissions_source_uniq` stops constraining candidate rows entirely —
-- every autosave tick would insert a fresh duplicate, which is the precise bug
-- the partial index was added to prevent (see 0181). Candidate rows therefore
-- need their own arbiter keyed on candidate_intake_id. The employee index is
-- left byte-for-byte alone: `recordHrFormSubmission` names it as its ON CONFLICT
-- arbiter, and an index that merely covers the same columns is a DIFFERENT index
-- to Postgres.
--
-- SAFE ON A POPULATED TABLE: every existing row has an employee_id and a NULL
-- candidate_intake_id, so it already satisfies the CHECK.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply.

ALTER TABLE hr_form_submissions
  ADD COLUMN IF NOT EXISTS candidate_intake_id uuid
    REFERENCES candidate_intake (id) ON DELETE CASCADE;

-- Drop the NOT NULL so a candidate row can exist. The CHECK below is what keeps
-- "a row always has a subject" true; this ALTER on its own would not.
ALTER TABLE hr_form_submissions
  ALTER COLUMN employee_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_form_submissions_subject_chk'
  ) THEN
    ALTER TABLE hr_form_submissions
      ADD CONSTRAINT hr_form_submissions_subject_chk
      CHECK (
        (employee_id IS NOT NULL AND candidate_intake_id IS NULL)
        OR
        (employee_id IS NULL AND candidate_intake_id IS NOT NULL)
      );
  END IF;
END $$;

-- The idempotency guarantee for candidate rows — the mirror of
-- hr_form_submissions_source_uniq, which only ever constrains employee rows.
CREATE UNIQUE INDEX IF NOT EXISTS hr_form_submissions_candidate_source_uniq
  ON hr_form_submissions (form_key, candidate_intake_id, source_id)
  WHERE candidate_intake_id IS NOT NULL AND source_id IS NOT NULL;

-- Serves "every form this candidate has filled", the candidate-side mirror of
-- hr_form_submissions_employee_idx. Same DESC NULLS LAST for the same reason:
-- the list pages order by submitted_at desc nulls last and only this form of the
-- index can serve that ordering.
CREATE INDEX IF NOT EXISTS hr_form_submissions_candidate_idx
  ON hr_form_submissions (candidate_intake_id, submitted_at DESC NULLS LAST);
