-- ===========================================================================
--  INCENTIVE MODULE — PRODUCTION DATABASE UPDATE
--  Altus WMS · branch `Om` · prepared 2026-09-15
-- ===========================================================================
--
--  DATABASE
--    PostgreSQL (Supabase). Not for MySQL, SQLite or SQL Server.
--
--  WHAT THIS DOES, IN PLAIN ENGLISH
--    Adds what the new Incentive features need to store:
--      · splitting an incentive between 2–5 people
--      · the new request statuses (Due, Not Due, Reversed, Revision Requested)
--      · the full history of every request version and every decision
--      · a record of every change made to the Incentive Table
--      · a "sent once" record so nobody gets the same notice twice
--      · employee codes, which the new dashboard shows and searches by
--
--  WHAT IT DOES NOT DO
--    It deletes no data. There is no DROP TABLE, DROP COLUMN, DELETE or
--    TRUNCATE anywhere in this file. The only things dropped are two old
--    rules (CHECK constraints) that are immediately replaced by wider ones,
--    and triggers that are immediately recreated.
--
--  WHERE EACH STATEMENT COMES FROM
--    Copied exactly from the project's own migration files — nothing retyped:
--      db/migrations/0229_incentive_request_split.sql
--      db/migrations/0230_incentive_approval_workflow.sql
--      db/migrations/0231_incentive_notifications.sql
--    plus two single statements the Incentive features also depend on:
--      db/migrations/0064_incentive_type_check_drop.sql  (lets Leads / Referrals be saved)
--      db/migrations/0225_employee_master.sql            (the employee_code column only)
--
--  HOW TO RUN
--    1. Take a backup of the database first (Supabase → Database → Backups).
--    2. Have someone review this file.
--    3. Supabase Dashboard → SQL Editor → New query → paste the whole file → Run.
--         or:  psql "$DATABASE_URL" -f incentive-production.sql
--    4. The last result shown is a single row of checks. Every column ending
--       in a number should read `true`. See the VERIFY section at the bottom.
--
--  ORDER
--    Run this BEFORE the new Incentive code is deployed. The old code keeps
--    working after this runs; the new code does not work until it has run.
--
--  SAFE TO RUN TWICE
--    Every statement checks first ("IF NOT EXISTS", "IF EXISTS", "NOT EXISTS"),
--    so a second run changes nothing and creates no duplicate rows.
--
--  ALL OR NOTHING
--    Everything is inside one transaction. If any statement fails, the whole
--    file is undone and the database is left exactly as it was.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  BEFORE ANYTHING CHANGES — make sure the tables this update builds on exist
-- ---------------------------------------------------------------------------
--  If the database is not the one this was written for, stop here with a
--  clear message instead of half-applying. Because this runs inside the
--  transaction, stopping here changes nothing.

DO $prereq$
DECLARE
  missing text[] := ARRAY[]::text[];
  col text;
BEGIN
  -- array_append, not `||`: PostgreSQL reads `text[] || 'some text'` as two
  -- arrays joined, fails to parse the text as an array, and stops with a
  -- confusing "malformed array literal" instead of the message below.
  IF to_regclass('public.employees') IS NULL THEN
    missing := array_append(missing, 'table employees');
  END IF;

  IF to_regclass('public.incentive_requests') IS NULL THEN
    missing := array_append(missing, 'table incentive_requests');
  ELSE
    FOREACH col IN ARRAY ARRAY['id', 'employee_id', 'type', 'status', 'details',
                               'decided_by_id', 'decided_at', 'decision_note', 'created_at'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'incentive_requests'
           AND column_name = col
      ) THEN
        missing := array_append(missing, 'column incentive_requests.' || col);
      END IF;
    END LOOP;
  END IF;

  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    missing := array_append(missing, 'function gen_random_uuid()');
  END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Incentive update stopped before changing anything. Missing: %',
      array_to_string(missing, ', ');
  END IF;
END
$prereq$;


-- ===========================================================================
--  Incentive Request changes
-- ===========================================================================

-- 1. Allow the new "Leads / Referrals" request type.
--    The very first version of the table only accepted four request types.
--    Migration 0064 removed that rule long ago; this makes sure it is gone
--    here too, otherwise every Leads / Referrals request would be refused.
--    Removes a rule only — no data is touched.

ALTER TABLE incentive_requests DROP CONSTRAINT IF EXISTS incentive_requests_type_check;

-- 2. Split Incentive.
--    A request can now be shared between 2 and 5 people. Who and what
--    percentage is stored in one new column. Empty means "not split", which is
--    what every existing request becomes — nothing to fill in for old rows.
--    The rule below only checks it is a list of 2–5 people; the app checks
--    that the percentages add up to exactly 100%.

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS split jsonb;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_split_shape_chk;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_split_shape_chk CHECK (
    split IS NULL
    OR CASE
         WHEN jsonb_typeof(split) = 'array' THEN jsonb_array_length(split) BETWEEN 2 AND 5
         ELSE false
       END
  );


-- ===========================================================================
--  Approval / Rejection / Resubmission changes
-- ===========================================================================

-- 3. The request statuses.
--    Before: Pending, Approved, Rejected.
--    After:  Pending Approval, Approved, Not Approved, Due, Not Due, Reversed,
--            Revision Requested.
--    "Not Approved" is still stored as `rejected`, so existing rejected
--    requests need no change. The list stays closed, so a typo in the app
--    cannot invent a status.

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_status_check;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  );

-- 4. Which version of the request is current, and when it was last resubmitted.
--    Every existing request becomes version 1 automatically.

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS submission_no integer NOT NULL DEFAULT 1;

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_submission_no_chk;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_submission_no_chk CHECK (submission_no >= 1);

-- 5. Every version an employee sends.
--    Version 1 is the original request. Each "Justify & Resubmit" adds the next
--    version, and a resubmission must include a justification — the database
--    refuses one without it.

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

-- 6. Every decision Manan makes.
--    Who decided, on which version, the status before and after, and why.
--    Not Approved, Reversed and Revise must have a reason — the database
--    refuses them without one.

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

-- 7. History cannot be edited.
--    Rows in the two history tables can be added, never changed. They are
--    removed only if the request itself is removed.

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

-- 8. DATA UPDATE — start the history for requests that already exist.
--    Every existing request gets its "version 1" copied from what it holds
--    today, dated when it was created. Every request that was already approved
--    or rejected gets one history entry marked `legacy`, with the reviewer and
--    note already on record. Existing requests are only read, never changed.
--    Guarded with NOT EXISTS, so a second run adds nothing.

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


-- ===========================================================================
--  Dashboard / Target changes
-- ===========================================================================

-- 9. Employee codes.
--    The new Incentive Dashboard shows each person's employee code and lets
--    you search by it. The column did not exist before, so without this the
--    whole Incentive page fails to load.
--    This is ONE statement taken from the Employee Master migration (0225). It
--    adds an empty column and nothing else. When 0225 itself is run later, this
--    line is simply skipped and 0225 adds the rest (codes, their rules, the
--    code registry). Until then the dashboard shows no codes, which is fine.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_code text;

--    Targets need no database change: the new "fill in my missing target"
--    option writes to the existing incentive_targets table, using columns that
--    already exist there. Grades, ranks and % of CTC are calculated by the app
--    and are not stored.


-- ===========================================================================
--  Incentive Master / Eligibility changes
-- ===========================================================================

-- 10. A record of every change to the Incentive Table.
--     Each time an incentive is added, changed or removed, one row records
--     what it looked like before and after, and who did it. The row's date is
--     also the "with effect from" date sent when someone stops being eligible.
--     Rows can be added, never edited.
--     Eligibility itself needs no change: it uses the existing "Sales Eligible"
--     and "Interns Eligible" settings on the Incentive Table.

create table if not exists incentive_catalog_events (
  id           uuid primary key default gen_random_uuid(),
  catalog_id   uuid,
  catalog_name text not null,
  event_type   text not null,
  before       jsonb,
  after        jsonb,
  changes      jsonb not null default '[]'::jsonb,
  actor_id     uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint incentive_catalog_events_type_chk
    check (event_type in ('created', 'updated', 'deleted')),
  constraint incentive_catalog_events_snapshot_chk check (
    (event_type = 'created' and after is not null)
    or (event_type = 'updated' and before is not null and after is not null)
    or (event_type = 'deleted' and before is not null)
  )
);

create index if not exists incentive_catalog_events_catalog_idx
  on incentive_catalog_events (catalog_id, created_at);

create or replace function incentive_catalog_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'incentive_catalog_events is append-only';
end;
$$;

drop trigger if exists incentive_catalog_events_no_update on incentive_catalog_events;
create trigger incentive_catalog_events_no_update
  before update on incentive_catalog_events
  for each row execute function incentive_catalog_events_immutable();


-- ===========================================================================
--  Notifications / Email changes
-- ===========================================================================

-- 11. "Already sent" record for incentive notices and emails.
--     Before any incentive notice or email goes out, one row is written for
--     that person and that event. If the same event is processed again (a
--     retry, a page refresh), the row already exists and nothing is re-sent.
--
--     The 13 new notification types themselves need no database change: the
--     notification type column is plain text, and new types are sent on every
--     channel the admin settings allow unless an admin turns them off.

create table if not exists incentive_notification_deliveries (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  subject_id   uuid not null,
  recipient_id uuid not null references employees(id) on delete cascade,
  version_key  text not null,
  created_at   timestamptz not null default now()
);

create unique index if not exists incentive_notification_deliveries_uq
  on incentive_notification_deliveries (event_type, subject_id, recipient_id, version_key);

create index if not exists incentive_notification_deliveries_recipient_idx
  on incentive_notification_deliveries (recipient_id, created_at);


-- ===========================================================================
--  Other Incentive changes
-- ===========================================================================

-- None. Everything else in the Incentive work — form checks, the approval
-- rules, the dashboard calculations, grades, ranking, visibility, email
-- wording — lives in the app and needs nothing stored.

COMMIT;


-- ===========================================================================
--  VERIFY — run automatically as the last statement
-- ===========================================================================
--  One row. Columns 1–9 are what this file just did: every one should be
--  `true`. If not, do not deploy the new Incentive code — send the row to the
--  developer.
--
--  The `app_needs_…` columns are NOT changed by this file. They are existing
--  pieces the new Incentive pages also rely on. If one shows `false`, apply the
--  named migration before deploying:
--    app_needs_employment_status → db/migrations/0212_employee_offboarding.sql
--    app_needs_account_type      → db/migrations/0183_candidate_guest_accounts.sql

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'incentive_requests'
             AND column_name = 'split')                                           AS "1_split_column",
  NOT EXISTS (SELECT 1 FROM pg_constraint
               WHERE conrelid = to_regclass('public.incentive_requests')
                 AND conname = 'incentive_requests_type_check')                   AS "2_leads_referrals_allowed",
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = to_regclass('public.incentive_requests')
             AND conname = 'incentive_requests_status_check'
             AND pg_get_constraintdef(oid) LIKE '%revision_requested%')           AS "3_new_statuses",
  to_regclass('public.incentive_request_submissions') IS NOT NULL
    AND to_regclass('public.incentive_request_decisions') IS NOT NULL             AS "4_history_tables",
  NOT EXISTS (SELECT 1 FROM incentive_requests r
               WHERE NOT EXISTS (SELECT 1 FROM incentive_request_submissions s
                                  WHERE s.request_id = r.id))                     AS "5_every_request_has_history",
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgname = 'incentive_request_decisions_immutable')                AS "6_history_locked",
  to_regclass('public.incentive_catalog_events') IS NOT NULL                      AS "7_incentive_table_changes",
  to_regclass('public.incentive_notification_deliveries') IS NOT NULL             AS "8_sent_once_record",
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'employees'
             AND column_name = 'employee_code')                                   AS "9_employee_code",
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'employees'
             AND column_name = 'employment_status')                               AS app_needs_employment_status,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'employees'
             AND column_name = 'account_type')                                    AS app_needs_account_type;
