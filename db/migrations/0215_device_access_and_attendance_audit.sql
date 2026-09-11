-- 0215 — DEVICE-BASED WMS ACCESS + ATTENDANCE SECURITY.
--
-- Three things, in one migration because they are one feature:
--
--   1. mobile_devices grows the audit columns a revocation needs (who revoked
--      it, why, who registered it) so a revoked device stays in history as a
--      readable record instead of a row that merely stopped working.
--   2. THE CAP CHANGES SHAPE: one approved LAPTOP and one approved PHONE per
--      employee, replacing 0214's "two of any kind".
--   3. attendance_audit_log — the immutable trail every privileged attendance
--      change writes to.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Device audit columns
------------------------------------------------------------------------
-- `approved_by_id` / `approved_at` / `revoked_at` already exist (0205a). What
-- was missing is the other half of a revocation: revoking a device is a
-- privileged act against another person's ability to work, and until now it
-- left no trace of who did it or why.

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoke_reason text;

-- Who ENROLLED the row. NULL for the self-service paths that have always
-- existed (the app's "Register this device" button, the web punch's first-visit
-- adoption); set when a device administrator registers a device on someone's
-- behalf from the admin screen.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- The last time this device was seen anywhere in the WMS, as opposed to
-- `last_used_at`, which the punch path stamps. Separate because the question
-- "is this laptop still in use" is now asked of the whole application, not just
-- of attendance, and collapsing the two would make a device that browses daily
-- but never punches look abandoned.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- DELIBERATELY NOT STORED: IP addresses, full user-agent strings, screen
-- fingerprints, canvas/font hashes. None of them is needed to answer "may this
-- device use the WMS" — the device id answers that — and each one is a lasting
-- record of where an employee physically was and what they run. The columns
-- kept (kind, label, platform) are what a person needs to recognise their own
-- device on the approval screen, and nothing more.

------------------------------------------------------------------------
-- 2. The cap: ONE approved laptop + ONE approved phone
------------------------------------------------------------------------
-- 0214 made the cap two approved devices of ANY kind. The device-access rule
-- being implemented now is explicitly one desktop/laptop AND one mobile phone,
-- so the shape goes back to per-kind — but the total stays two, so nobody
-- gains or loses capacity, and every employee holding one of each (the common
-- case, and the only case 0206 ever allowed) is untouched.

-- Data reconciliation, and the ONLY row-affecting statement here. Between 0214
-- and now an employee could have accumulated two approved laptops or two
-- approved phones, which the new rule cannot express. Keep the most recently
-- used of each kind and revoke the rest — recorded as a real revocation with a
-- reason, not a silent status flip, so it appears in device history like any
-- other. Expected to match zero rows on a database where everyone holds one of
-- each.
UPDATE mobile_devices m
   SET status = 'revoked',
       revoked_at = now(),
       revoke_reason = 'Superseded by the one-laptop-one-phone rule (migration 0215)'
 WHERE m.status = 'approved'
   AND m.id <> (
     SELECT k.id
       FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.kind = m.kind
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 1
   );

-- 0214's trigger enforced the old cardinality: "at most two approved rows per
-- employee, kind ignored". It cannot express one-per-kind, so the function body
-- is replaced. Replaced rather than dropped-and-recreated so there is never a
-- window in which the table has no cap at all.
CREATE OR REPLACE FUNCTION mobile_devices_cap_approved() RETURNS trigger AS $fn$
DECLARE
  approved_same_kind int;
BEGIN
  -- Only an approved row consumes a slot. Pending registrations and revoked
  -- history accumulate freely: a replacement must be registerable while the
  -- device it succeeds is still approved.
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  -- An UPDATE that leaves an already-approved row approved on the same kind for
  -- the same person (stamping last_used_at / last_seen_at, which now happens on
  -- ordinary page loads and not just punches) changes no count and must not pay
  -- for a lock or a scan.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND OLD.employee_id = NEW.employee_id
     AND OLD.kind = NEW.kind THEN
    RETURN NEW;
  END IF;

  -- The advisory lock is what makes this a guarantee rather than a check: two
  -- concurrent approvals cannot see each other's uncommitted rows, so without
  -- it both read "0 approved" and both write. Locking on employee+kind
  -- serialises approvals for ONE person's ONE slot and nobody else's.
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

-- With the cap back to one per kind the cardinality IS expressible as a partial
-- unique index again — and an index is a stronger guarantee than a trigger,
-- because a session can disable triggers and cannot disable an index. Belt and
-- braces: the trigger raises the readable error, the index makes the rule true
-- regardless. (0206 had this index; 0214 dropped it. It comes back deliberately.)
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_employee_kind_approved_uq
  ON mobile_devices (employee_id, kind)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS mobile_devices_employee_status_idx
  ON mobile_devices (employee_id, status);

------------------------------------------------------------------------
-- 3. attendance_audit_log — the immutable trail
------------------------------------------------------------------------
-- Every PRIVILEGED attendance modification lands here: who changed whose
-- attendance, from what to what, on which device, under which authorization.
--
-- SEPARATE FROM employee_events ON PURPOSE. employee_events is a generic
-- admin-activity feed whose payload is jsonb; this table has to answer a
-- specific question quickly ("every change to Om's September attendance, by
-- whom, from which device") and its filter columns — attendance_date, actor,
-- target, device — are exactly those filters. Squeezed into a generic jsonb
-- payload, the change-log screen becomes a table scan with jsonb extraction in
-- the WHERE clause.

CREATE TABLE IF NOT EXISTS attendance_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The punch row this concerns. NULLABLE and ON DELETE SET NULL: a delete
  -- action's whole point is that the row is gone, and an audit trail that
  -- vanished with the record it describes would be worthless exactly when it
  -- matters. attendance_date + punch_kind below keep the record identifiable
  -- after the punch itself no longer exists.
  attendance_log_id uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,

  -- WHOSE attendance changed.
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- WHO changed it. ON DELETE RESTRICT — an actor cannot be deleted out of the
  -- audit trail; the same choice employee_events made.
  actor_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,

  -- WHAT changed.
  action            text NOT NULL,           -- create | update | delete | clear
  field             text,                    -- check_in | check_out | punch
  attendance_date   date NOT NULL,           -- the DAY whose attendance changed
  punch_kind        text,                    -- in | out
  old_value         text,                    -- human-readable, e.g. "18:02"
  new_value         text,                    -- human-readable, e.g. "18:27"
  reason            text,

  -- WHICH DEVICE. Kept as BOTH an fk and a denormalised label+kind: the fk is
  -- the live link, the copies are what the log must still be able to say after
  -- the device row is revoked and eventually purged.
  device_row_id     uuid REFERENCES mobile_devices(id) ON DELETE SET NULL,
  device_label      text,
  device_kind       text,

  -- WHY IT WAS ALLOWED. The authorization decision as the server made it: which
  -- capability was used, whether a lock was overridden, whether the 15-minute
  -- window was open. This is the difference between a log that says what
  -- happened and one that can answer whether it should have.
  authorization_context jsonb,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_audit_employee_date_idx
  ON attendance_audit_log (employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_actor_created_idx
  ON attendance_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_created_idx
  ON attendance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_action_idx
  ON attendance_audit_log (action);

------------------------------------------------------------------------
-- 3a. APPEND-ONLY, ENFORCED IN THE DATABASE
------------------------------------------------------------------------
-- The brief requires that even Ruchita and Rutvisha cannot edit or delete
-- history. Two independent mechanisms, because they fail in different ways:
--
--   · REVOKE (at the bottom) is the pattern employee_events / settings_events
--     already use. It stops the `authenticated` and `anon` Supabase roles —
--     anything reaching the table through PostgREST or a client library.
--
--   · A TRIGGER, which REVOKE cannot replace. The Next.js server connects as
--     the database owner, and an owner's privileges cannot be revoked away — so
--     a REVOKE-only table is fully mutable from the application, which is
--     exactly the actor the brief names. The trigger fires for every role
--     including the owner, so an UPDATE or DELETE issued from application code
--     raises instead of succeeding.
--
-- Neither blocks a superuser at a psql prompt, and nothing in-database could:
-- that is the boundary of what "immutable from the application" can mean.

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

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own
-- statement-level one. Without it, "immutable" is one TRUNCATE from an empty
-- table — and `wipeAllAttendance` in the dashboard actions truncates the
-- attendance tables by design.
DROP TRIGGER IF EXISTS attendance_audit_log_no_truncate_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_truncate_trg
  BEFORE TRUNCATE ON attendance_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_audit_log_immutable();

ALTER TABLE attendance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_audit_read_admin"   ON attendance_audit_log;
DROP POLICY IF EXISTS "attendance_audit_insert_actor" ON attendance_audit_log;

-- SELECT: admins. The application narrows this further to the
-- `attendance.view_audit_log` capability before rendering the change-log page;
-- this policy is the floor beneath that, not the rule itself.
CREATE POLICY "attendance_audit_read_admin"
  ON attendance_audit_log FOR SELECT
  TO authenticated
  USING (app.is_admin());

-- INSERT: the actor must be writing as themselves. Server actions already pin
-- actor_id to the resolved session; the WITH CHECK is belt and braces.
CREATE POLICY "attendance_audit_insert_actor"
  ON attendance_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = app.current_employee_id());

REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM anon;
