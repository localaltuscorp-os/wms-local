-- =============================================================================
-- WMS — SCHEMA DRIFT FIXES
-- Applied to Supabase project fjopgyqytfvbudkwhdto on 2026-09-09 / 2026-09-10
-- =============================================================================
--
-- CONTEXT
--   The 2026-09-08 merge shipped application code whose migrations were never
--   run against the database. Every failure below was schema drift, not an
--   application bug. Symptoms and their real causes:
--
--     "Email or password didn't match"  -> employees.employment_status missing
--     "That didn't go through" (Goals)  -> goals.client missing
--     attendance punch-in blocked       -> stale 0206 per-kind device index
--     device gate would 500 everywhere  -> mobile_devices 0215 columns missing
--
--   The login error was especially misleading: Firebase authentication was
--   SUCCEEDING, then POST /api/auth/session 500'd on the employees query with
--   42703, and the client fell through to its generic no-error-code message.
--
--
-- ⚠️  BEFORE RUNNING THIS AGAINST ANOTHER DATABASE
--
--   1. RE-RUN THE PRE-FLIGHT SECTION. The counts recorded here (0 devices
--      revoked, 18 approved) are specific to fjopgyqytfvbudkwhdto.
--
--   2. THE RLS BLOCK (PART 3b) WAS OMITTED HERE. This database has no `app`
--      schema — 0004_m2_rls_helpers.sql was never applied, so app.is_admin()
--      and app.current_employee_id() do not exist and CREATE POLICY fails,
--      rolling back the whole transaction. Check first:
--          SELECT count(*) FROM pg_namespace WHERE nspname = 'app';
--      1 -> include PART 3b.   0 -> omit it.
--
--   3. 0214_two_approved_devices_any_kind AND 0215 ARE CONTRADICTORY BY DESIGN.
--      0214 = two approved devices of ANY kind.
--      0215 = one laptop AND one phone, and explicitly retires 0214.
--      0215 supersedes 0214. Run in the order below and the end state is
--      0215's rule. Never run 0214 after 0215.
--
--   4. Everything is idempotent (IF NOT EXISTS / ON CONFLICT / CREATE OR
--      REPLACE). Safe to re-run. Each PART is its own transaction.
--
--
-- RESULT ON fjopgyqytfvbudkwhdto
--   approved devices : 18 before -> 18 after  (nothing revoked)
--   employees        : 72 -> 77 columns
--   login            : restored
--
--
-- RELATED, NOT SQL — same root-cause class, worth checking on any deployment:
--   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
--   SUPABASE_SERVICE_ROLE_KEY pointed at a DIFFERENT, decommissioned Supabase
--   project than DATABASE_URL, so every file upload failed with
--   "signature verification failed". Fixed by repointing all three at the same
--   project as DATABASE_URL and redeploying (NEXT_PUBLIC_* is inlined at build
--   time, so an env change alone does nothing).
-- =============================================================================


-- =============================================================================
-- PRE-FLIGHT — run first, read the output, do not skip
-- =============================================================================

-- What is already applied here?
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='employees' AND column_name='employment_status')  AS employees_offboarding,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='goals' AND column_name='client')                 AS goals_client,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='mobile_devices' AND column_name='last_seen_at')  AS device_0215,
  (SELECT count(*) FROM pg_namespace WHERE nspname='app')               AS app_schema_exists,
  (SELECT count(*) FROM mobile_devices WHERE status='approved')         AS approved_devices;

-- DESTRUCTIVE STEP CHECK. PART 3 revokes approved devices beyond one per kind.
-- This MUST return 0. If it does not, STOP and review who would lose a device.
SELECT count(*) AS would_be_revoked
  FROM mobile_devices m
 WHERE m.status = 'approved'
   AND m.id <> (
     SELECT k.id FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.kind = m.kind
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 1
   );


-- =============================================================================
-- PART 1 — LOGIN FIX  (CRITICAL — run this first)
--
-- 0212_employee_offboarding.sql
-- Source: commit 81bbfdd5, Rakesh Dubey, 2026-09-07
--         "Employee offboarding: archive instead of hard-delete"
--         db/schema.ts shipped; this migration never ran.
-- =============================================================================

BEGIN;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_working_day date,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text,
  ADD COLUMN IF NOT EXISTS anonymised_at timestamptz;

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employment_status_check;
ALTER TABLE employees ADD CONSTRAINT employees_employment_status_check
  CHECK (employment_status IN ('active', 'former', 'anonymised'));

CREATE INDEX IF NOT EXISTS employees_employment_status_idx
  ON employees (employment_status);

CREATE TABLE IF NOT EXISTS employee_exits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL UNIQUE REFERENCES employees (id) ON DELETE CASCADE,
  exit_reason         text NOT NULL,
  exit_reason_other   text,
  rehire_eligibility  text NOT NULL DEFAULT 'with_review',
  rehire_note         text,
  joined_at           timestamptz,
  resignation_date    date,
  last_working_day    date,
  notice_served       boolean,
  notice_days         integer,
  paid_in_lieu        boolean NOT NULL DEFAULT false,
  successor_id        uuid REFERENCES employees (id) ON DELETE SET NULL,
  reassigned          jsonb NOT NULL DEFAULT '{}'::jsonb,
  handover            jsonb NOT NULL DEFAULT '{}'::jsonb,
  exit_interview      jsonb,
  firebase_deleted    boolean NOT NULL DEFAULT false,
  firebase_error      text,
  avatar_purged       boolean NOT NULL DEFAULT false,
  notes               text,
  archived_by_id      uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  archived_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_exits DROP CONSTRAINT IF EXISTS employee_exits_reason_check;
ALTER TABLE employee_exits ADD CONSTRAINT employee_exits_reason_check
  CHECK (exit_reason IN (
    'resigned', 'terminated_for_cause', 'redundancy', 'contract_ended',
    'abandonment', 'retirement', 'deceased', 'other'
  ));

ALTER TABLE employee_exits DROP CONSTRAINT IF EXISTS employee_exits_other_needs_text;
ALTER TABLE employee_exits ADD CONSTRAINT employee_exits_other_needs_text
  CHECK (
    exit_reason <> 'other'
    OR nullif(btrim(coalesce(exit_reason_other, '')), '') IS NOT NULL
  );

ALTER TABLE employee_exits DROP CONSTRAINT IF EXISTS employee_exits_rehire_check;
ALTER TABLE employee_exits ADD CONSTRAINT employee_exits_rehire_check
  CHECK (rehire_eligibility IN ('yes', 'no', 'with_review'));

CREATE INDEX IF NOT EXISTS employee_exits_archived_at_idx ON employee_exits (archived_at DESC);
CREATE INDEX IF NOT EXISTS employee_exits_reason_idx      ON employee_exits (exit_reason);
CREATE INDEX IF NOT EXISTS employee_exits_successor_idx   ON employee_exits (successor_id);

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_class    text NOT NULL UNIQUE,
  retention_days  integer NOT NULL,
  legal_basis     text NOT NULL,
  purge_enabled   boolean NOT NULL DEFAULT false,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_retention_policies DROP CONSTRAINT IF EXISTS data_retention_positive;
ALTER TABLE data_retention_policies ADD CONSTRAINT data_retention_positive
  CHECK (retention_days > 0);

INSERT INTO data_retention_policies
  (record_class, retention_days, legal_basis, purge_enabled, notes)
VALUES
  ('attendance_records', 1095,
   'Maharashtra Shops & Establishments Act; Payment of Wages Act — muster/attendance registers, 3 years',
   false,
   'UI shows a 60-day window for former employees; rows are retained for the statutory period.'),
  ('payroll_records', 2920, 'PF & ESI contribution records — 8 years', false, NULL),
  ('income_tax_records', 2190, 'Income Tax Act — 6 years from end of assessment year', false, NULL),
  ('audit_events', 2555, 'Internal control / incident investigation — 7 years', false,
   'Never purge on exit. Misconduct is routinely discovered months after a departure.'),
  ('employee_pii', 2555,
   'Retained for statutory employment claims, then pseudonymised (not deleted)', false,
   'Drives anonymisation of former employees; legal_hold overrides it.'),
  ('work_session_shots', 7, 'Operational only — screen-share proof frames', true, NULL),
  ('exit_records', 2555, 'Employment verification requests — 7 years', false, NULL)
ON CONFLICT (record_class) DO NOTHING;

COMMIT;


-- =============================================================================
-- PART 2 — DAILY GOALS + ATTENDANCE PUNCH-IN
--
-- 0212_goals_client.sql
-- 0212_project_node_attachments.sql
-- 0213_dont_know_label_not_read.sql
-- 0213_project_node_intake.sql
-- 0214_project_node_links.sql
-- 0214_two_approved_devices_any_kind.sql   <- superseded by PART 3
-- =============================================================================

BEGIN;

-- ---- 0212_goals_client.sql -------------------------------------------------
ALTER TABLE goals ADD COLUMN IF NOT EXISTS client text;
CREATE INDEX IF NOT EXISTS goals_client_idx ON goals (client) WHERE client IS NOT NULL;

-- ---- 0212_project_node_attachments.sql -------------------------------------
CREATE TABLE IF NOT EXISTS "project_node_attachments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "node_id"        uuid NOT NULL REFERENCES "project_nodes"("id") ON DELETE CASCADE,
  "storage_path"   text NOT NULL,
  "file_name"      text NOT NULL,
  "mime"           text,
  "size_bytes"     integer,
  "uploaded_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "project_node_attachments_node_idx"
  ON "project_node_attachments" ("node_id", "created_at");

-- ---- 0213_dont_know_label_not_read.sql -------------------------------------
-- Scoped to the stale seed value so a deliberate admin rename is preserved.
UPDATE status_settings
   SET label = 'Not Read'
 WHERE status = 'dont_know'
   AND label = 'Don''t Know';

INSERT INTO status_settings (status, label, color_token, display_order)
VALUES ('dont_know', 'Not Read', 'stone', 5)
ON CONFLICT (status) DO NOTHING;

-- ---- 0213_project_node_intake.sql ------------------------------------------
ALTER TABLE "project_nodes"
  ADD COLUMN IF NOT EXISTS "client_name"  text,
  ADD COLUMN IF NOT EXISTS "subject"      text,
  ADD COLUMN IF NOT EXISTS "priority"     text,
  ADD COLUMN IF NOT EXISTS "initiator_id" uuid
    REFERENCES "employees"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "tags"         text[];

-- ---- 0214_project_node_links.sql -------------------------------------------
ALTER TABLE "project_nodes"
  ADD COLUMN IF NOT EXISTS "links" text[];

-- ---- 0214_two_approved_devices_any_kind.sql --------------------------------
-- SUPERSEDED BY 0215 (PART 3). Included for ordering fidelity only: it is what
-- was actually applied at 2026-09-09 14:09, before 0215 reversed it.
UPDATE mobile_devices m
   SET status = 'revoked', revoked_at = now()
 WHERE m.status = 'approved'
   AND m.id NOT IN (
     SELECT k.id FROM mobile_devices k
      WHERE k.employee_id = m.employee_id AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 2
   );

DROP INDEX IF EXISTS mobile_devices_employee_kind_approved_uq;

CREATE OR REPLACE FUNCTION mobile_devices_cap_approved() RETURNS trigger AS $fn$
DECLARE
  approved_others int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND OLD.employee_id = NEW.employee_id THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mobile_devices_cap:' || NEW.employee_id::text));
  SELECT count(*) INTO approved_others
    FROM mobile_devices
   WHERE employee_id = NEW.employee_id AND status = 'approved' AND id <> NEW.id;
  IF approved_others >= 2 THEN
    RAISE EXCEPTION 'mobile_devices_employee_approved_cap'
      USING HINT = 'This employee already has 2 approved devices. Revoke one first.';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mobile_devices_cap_approved_trg ON mobile_devices;
CREATE TRIGGER mobile_devices_cap_approved_trg
  BEFORE INSERT OR UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION mobile_devices_cap_approved();

CREATE INDEX IF NOT EXISTS mobile_devices_kind_idx ON mobile_devices (kind);

-- ---- migration ledger ------------------------------------------------------
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES
  ('0212_goals_client.sql'),
  ('0212_project_node_attachments.sql'),
  ('0213_dont_know_label_not_read.sql'),
  ('0213_project_node_intake.sql'),
  ('0214_project_node_links.sql'),
  ('0214_two_approved_devices_any_kind.sql')
ON CONFLICT DO NOTHING;

COMMIT;


-- =============================================================================
-- PART 3 — 0215_device_access_and_attendance_audit.sql
--
-- Required by the device-verification work (one laptop AND one phone,
-- unregistered devices blocked). MUST run BEFORE that code deploys:
-- lib/security/device-access.ts reads these columns on EVERY request, so
-- deploying first reproduces the same 42703 outage on every page.
--
-- RLS block deliberately omitted — see PART 3b.
-- =============================================================================

BEGIN;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoke_reason text;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- DESTRUCTIVE. Matched 0 rows on fjopgyqytfvbudkwhdto.
-- Confirm with the PRE-FLIGHT "would_be_revoked" query before running.
UPDATE mobile_devices m
   SET status = 'revoked',
       revoked_at = now(),
       revoke_reason = 'Superseded by the one-laptop-one-phone rule (migration 0215)'
 WHERE m.status = 'approved'
   AND m.id <> (
     SELECT k.id FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.kind = m.kind
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 1
   );

-- Replaces the 0214 "two of any kind" function with the per-kind rule.
-- The advisory lock is what makes this a guarantee rather than a check:
-- two concurrent approvals cannot see each other's uncommitted rows.
CREATE OR REPLACE FUNCTION mobile_devices_cap_approved() RETURNS trigger AS $fn$
DECLARE
  approved_same_kind int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND OLD.employee_id = NEW.employee_id
     AND OLD.kind = NEW.kind THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext('mobile_devices_cap:' || NEW.employee_id::text || ':' || NEW.kind)
  );
  SELECT count(*) INTO approved_same_kind
    FROM mobile_devices
   WHERE employee_id = NEW.employee_id
     AND kind = NEW.kind
     AND status = 'approved'
     AND id <> NEW.id;
  IF approved_same_kind >= 1 THEN
    RAISE EXCEPTION 'mobile_devices_employee_approved_cap'
      USING HINT = 'This employee already has an approved device of this kind. Revoke it first.';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mobile_devices_cap_approved_trg ON mobile_devices;
CREATE TRIGGER mobile_devices_cap_approved_trg
  BEFORE INSERT OR UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION mobile_devices_cap_approved();

-- The index is the guarantee, the trigger is the readable message.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_employee_kind_approved_uq
  ON mobile_devices (employee_id, kind)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS mobile_devices_employee_status_idx
  ON mobile_devices (employee_id, status);

CREATE TABLE IF NOT EXISTS attendance_audit_log (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id      uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,
  employee_id            uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_id               uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  action                 text NOT NULL,   -- create | update | delete | clear
  field                  text,            -- check_in | check_out | punch
  attendance_date        date NOT NULL,   -- the DAY whose attendance changed
  punch_kind             text,            -- in | out
  old_value              text,            -- human-readable, e.g. "18:02"
  new_value              text,            -- human-readable, e.g. "18:27"
  reason                 text,
  device_row_id          uuid REFERENCES mobile_devices(id) ON DELETE SET NULL,
  device_label           text,
  device_kind            text,
  authorization_context  jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_audit_employee_date_idx
  ON attendance_audit_log (employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_actor_created_idx
  ON attendance_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_created_idx
  ON attendance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_action_idx
  ON attendance_audit_log (action);

-- Append-only, enforced by trigger rather than by REVOKE alone: the Next.js
-- server connects with a role that REVOKE does not constrain, so a
-- REVOKE-only table would still be fully mutable from the application.
CREATE OR REPLACE FUNCTION attendance_audit_log_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'attendance_audit_log is append-only'
    USING HINT = 'Attendance audit records cannot be modified or deleted. Record a corrective entry instead.';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_audit_log_no_update_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_update_trg
  BEFORE UPDATE ON attendance_audit_log
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_log_immutable();

DROP TRIGGER IF EXISTS attendance_audit_log_no_delete_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_delete_trg
  BEFORE DELETE ON attendance_audit_log
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_log_immutable();

DROP TRIGGER IF EXISTS attendance_audit_log_no_truncate_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_truncate_trg
  BEFORE TRUNCATE ON attendance_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_audit_log_immutable();

INSERT INTO __schema_applied (filename) VALUES
  ('0212_employee_offboarding.sql'),
  ('0215_device_access_and_attendance_audit.sql')
ON CONFLICT DO NOTHING;

COMMIT;


-- =============================================================================
-- PART 3b — RLS BLOCK.  RUN ONLY IF THE `app` SCHEMA EXISTS.
--
--   SELECT count(*) FROM pg_namespace WHERE nspname = 'app';
--
--   0 -> SKIP THIS ENTIRE SECTION. It was skipped on fjopgyqytfvbudkwhdto,
--        where no table has RLS at all because 0004_m2_rls_helpers.sql was
--        never applied. Running it there fails and rolls back PART 3 with it.
--   1 -> run it.
-- =============================================================================

-- ALTER TABLE attendance_audit_log ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "attendance_audit_read_admin"   ON attendance_audit_log;
-- DROP POLICY IF EXISTS "attendance_audit_insert_actor" ON attendance_audit_log;
--
-- CREATE POLICY "attendance_audit_read_admin"
--   ON attendance_audit_log FOR SELECT
--   TO authenticated
--   USING (app.is_admin());
--
-- CREATE POLICY "attendance_audit_insert_actor"
--   ON attendance_audit_log FOR INSERT
--   TO authenticated
--   WITH CHECK (actor_id = app.current_employee_id());
--
-- REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM authenticated;
-- REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM anon;


-- =============================================================================
-- VERIFY — every value must match, and approved_devices must be UNCHANGED
--          from the PRE-FLIGHT reading.
-- =============================================================================

SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='employees'
       AND column_name IN ('employment_status','last_working_day','legal_hold',
                           'legal_hold_reason','anonymised_at'))                  AS employees_cols_must_be_5,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='mobile_devices'
       AND column_name IN ('last_seen_at','revoked_by_id','revoke_reason',
                           'registered_by_id'))                                   AS device_cols_must_be_4,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name IN ('attendance_audit_log','employee_exits',
                          'data_retention_policies','project_node_attachments'))  AS tables_must_be_4,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='goals' AND column_name='client')                           AS goals_client_must_be_1,
  (SELECT count(*) FROM pg_indexes
     WHERE indexname='mobile_devices_employee_kind_approved_uq')                  AS uq_index_must_be_1,
  (SELECT count(*) FROM mobile_devices WHERE status='approved')                   AS approved_devices;

-- Expected: 5, 4, 4, 1, 1, and approved_devices unchanged.
-- If approved_devices dropped, a device was revoked — investigate before
-- proceeding; the pre-flight said zero should be.
