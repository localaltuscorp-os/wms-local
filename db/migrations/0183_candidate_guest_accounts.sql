-- 0183 — Candidate guest accounts (Option B).
-- A "candidate" is a job applicant's limited login that can ONLY fill its own
-- interview form. Applied as idempotent SQL (journal is stale — see the
-- migration-journal-out-of-sync rule; NOT via db:migrate).

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS account_type        text    NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS candidate_intake_id uuid    REFERENCES candidate_intake(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_active    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivated_at      timestamptz;

DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_account_type_chk
    CHECK (account_type IN ('employee','candidate'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One-directional: a REAL employee must never carry a candidate link. Candidates
-- MAY have a null link (post intake-delete) so ON DELETE SET NULL can't violate.
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_employee_no_link_chk
    CHECK (account_type = 'candidate' OR candidate_intake_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hard guarantee: a candidate can NEVER be a normal-roster active account.
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_candidate_not_roster_chk
    CHECK (account_type = 'employee' OR is_active = false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employees_candidate_intake_uidx
  ON employees (candidate_intake_id) WHERE candidate_intake_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_account_type_idx
  ON employees (account_type) WHERE account_type = 'candidate';
