-- 0230 — INCENTIVE APPROVAL, REJECTION AND RESUBMISSION.
--
-- Every incentive request now goes through Manan Vasa's review, and a request
-- that is Not Approved (or sent back for revision) can be justified and
-- resubmitted. This migration adds what that needs and nothing else: Accounts,
-- payouts, the dashboard and the Incentive Master are untouched.
--
-- ── THE LIVE RECORD STAYS WHERE IT IS ─────────────────────────────────────
-- `incentive_requests` remains the one row per request. Its `status`,
-- `details`, `split` and `decided_*` columns describe the CURRENT submission
-- and the LATEST decision, exactly as every existing reader expects. What was
-- missing is the past, and that is what the two new tables hold.
--
-- ── STATUS VALUES ─────────────────────────────────────────────────────────
--   pending              Pending Approval
--   approved             Approved            (also the result of Publish)
--   rejected             Not Approved        (stored value kept: see below)
--   due                  Due
--   not_due              Not Due
--   reversed             Reversed
--   revision_requested   Revision Requested  (content types: Revise)
--
-- `rejected` is NOT renamed to `not_approved`. It already means exactly that,
-- rows and code read it today (lib/queries/weekly-goals.ts counts `approved`;
-- the unpaid calculation keys on `approved`), and renaming a stored value would
-- rewrite every decided row for a change of label. The label lives in
-- db/enums.ts.
--
-- The CHECK that pinned the old three values (Postgres auto-named it
-- `incentive_requests_status_check`) is replaced, not loosened: the new list is
-- still closed, so a typo in application code cannot invent a state.
--
-- ── WHY TWO HISTORY TABLES, NOT A JSON COLUMN ─────────────────────────────
-- A submission is a snapshot of what the employee sent; a decision is an act
-- by a reviewer. They have different columns, different authors and different
-- rules (a decision may need a reason; a resubmission needs a justification),
-- and the brief asks for both to be queryable: who decided, why, when, on which
-- version. A JSON array on the request would satisfy "keep history" while
-- making every one of those questions a parse.
--
-- ── IMMUTABLE BY CONSTRUCTION ─────────────────────────────────────────────
-- Both tables are append-only. A BEFORE UPDATE trigger refuses any edit, so the
-- audit trail cannot be rewritten by a stray query or a future bug. DELETE is
-- left to the ON DELETE CASCADE from the request itself — the history belongs
-- to the request, and removing an employee (which cascades their requests)
-- must not be blocked by it.
--
-- ── BACKFILL ──────────────────────────────────────────────────────────────
-- Every existing request gets its Submission 1 snapshot from its current row,
-- dated when it was created. Any request already decided gets one audit row
-- with action `legacy` — its reviewer and note are known, its previous status
-- is not recorded anywhere, so it is written as `pending`, the only state a
-- request could be decided from before this change.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. incentive_requests: the state list and the current version
------------------------------------------------------------------------
ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_status_check;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  );

-- The submission the live row currently holds. 1 for every existing request.
ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS submission_no integer NOT NULL DEFAULT 1;

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_submission_no_chk;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_submission_no_chk CHECK (submission_no >= 1);

------------------------------------------------------------------------
-- 2. Submissions — one immutable snapshot per version
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_request_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES incentive_requests (id) ON DELETE CASCADE,
  submission_no   integer NOT NULL,
  type            text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  split           jsonb,
  -- NULL on Submission 1; required on every resubmission (CHECK below).
  justification   text,
  submitted_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_request_submissions_no_chk CHECK (submission_no >= 1),
  -- A resubmission without a justification is exactly what the brief forbids;
  -- held here too so a writer that skips the application check still cannot.
  CONSTRAINT incentive_request_submissions_justification_chk CHECK (
    submission_no = 1 OR (justification IS NOT NULL AND length(btrim(justification)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS incentive_request_submissions_request_no_uq
  ON incentive_request_submissions (request_id, submission_no);

------------------------------------------------------------------------
-- 3. Decisions — the audit trail
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_request_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES incentive_requests (id) ON DELETE CASCADE,
  -- The request's owner at the time, denormalised so the trail reads without a
  -- join and survives a later change of owner.
  employee_id     uuid REFERENCES employees (id) ON DELETE SET NULL,
  submission_no   integer NOT NULL,
  previous_status text NOT NULL,
  new_status      text NOT NULL,
  action          text NOT NULL,
  reviewer_id     uuid REFERENCES employees (id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_request_decisions_action_chk CHECK (
    action IN ('approve', 'not_approve', 'due', 'not_due', 'reverse', 'publish', 'revise', 'legacy')
  ),
  CONSTRAINT incentive_request_decisions_prev_status_chk CHECK (
    previous_status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  ),
  CONSTRAINT incentive_request_decisions_new_status_chk CHECK (
    new_status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  ),
  -- The three decisions that must say why. `legacy` is exempt: those rows were
  -- decided before a reason was ever required.
  CONSTRAINT incentive_request_decisions_note_chk CHECK (
    action NOT IN ('not_approve', 'reverse', 'revise')
    OR (note IS NOT NULL AND length(btrim(note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS incentive_request_decisions_request_idx
  ON incentive_request_decisions (request_id, created_at);

------------------------------------------------------------------------
-- 4. Append-only
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION incentive_history_is_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is an audit trail — rows cannot be edited, only added.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS incentive_request_submissions_immutable ON incentive_request_submissions;
CREATE TRIGGER incentive_request_submissions_immutable
  BEFORE UPDATE ON incentive_request_submissions
  FOR EACH ROW EXECUTE FUNCTION incentive_history_is_immutable();

DROP TRIGGER IF EXISTS incentive_request_decisions_immutable ON incentive_request_decisions;
CREATE TRIGGER incentive_request_decisions_immutable
  BEFORE UPDATE ON incentive_request_decisions
  FOR EACH ROW EXECUTE FUNCTION incentive_history_is_immutable();

------------------------------------------------------------------------
-- 5. Backfill
------------------------------------------------------------------------
INSERT INTO incentive_request_submissions
  (request_id, submission_no, type, details, split, submitted_by_id, submitted_at)
SELECT r.id, 1, r.type, r.details, r.split, r.employee_id, r.created_at
  FROM incentive_requests r
 WHERE NOT EXISTS (
   SELECT 1 FROM incentive_request_submissions s WHERE s.request_id = r.id
 );

INSERT INTO incentive_request_decisions
  (request_id, employee_id, submission_no, previous_status, new_status, action, reviewer_id, note, created_at)
SELECT r.id, r.employee_id, r.submission_no, 'pending', r.status, 'legacy',
       r.decided_by_id, r.decision_note, r.decided_at
  FROM incentive_requests r
 WHERE r.decided_at IS NOT NULL
   AND r.status IN ('approved', 'rejected')
   AND NOT EXISTS (
     SELECT 1 FROM incentive_request_decisions d WHERE d.request_id = r.id
   );
