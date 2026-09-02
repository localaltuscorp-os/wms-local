-- 0205 — Remote work must be APPROVED, and Client Side must name a real place.
--
-- ── WHAT WAS MISSING ───────────────────────────────────────────────────────
-- `attendance_logs.work_mode` has existed since 0127 (office | wfh |
-- client_site | field | other), but nothing ever gated it. Anyone could punch
-- with work_mode='wfh' and the day graded exactly as if it had been agreed.
-- Applying for WFH and being granted it were the same act.
--
-- This migration adds the missing middle: a REQUEST with a lifecycle
-- (pending → approved / rejected), and a place for Client Side to point at.
--
-- ── WHY A TRIGGER AND NOT ONLY A SERVER CHECK ──────────────────────────────
-- `attendance_logs` has FOUR writers today — the shared `insertPunchRow`, the
-- mobile remote route, a web remote action and the auto-punch-out cron. A guard
-- in the two that currently set a remote work_mode would be correct today and
-- silently incomplete the moment a fifth writer appears; that is exactly how
-- the ungated hole in 0127 survived this long. The trigger is the backstop that
-- does not depend on every future caller remembering.
--
-- ADMIN PUNCHES ARE EXEMPT, deliberately. `source='admin'` is already a
-- privileged, authenticated act that records `recorded_by_id`, and it is the
-- normal remedy when an approval lands after the fact. Blocking it would leave
-- HR unable to correct a record that everyone agrees is right — a rule strict
-- enough to have no escape hatch stops being enforced and starts being routed
-- around.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply.

-- ── Client locations ──────────────────────────────────────────────────────
-- Standalone rather than hung off `clients` / `billing_clients`: this is an
-- ATTENDANCE fact (where a person physically was), it needs a pin and a radius
-- that no existing client list carries, and it must not inherit the lifecycle
-- of a billing record.
CREATE TABLE IF NOT EXISTS client_locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  address      text,
  -- Nullable so a location can be recorded by name before someone drops the
  -- pin. `radius_m` mirrors org_settings.attendance_radius_m, which is how the
  -- office geofence is already expressed — one idea, one shape.
  lat          double precision,
  lng          double precision,
  radius_m     integer NOT NULL DEFAULT 200,
  /** The pasted Google Maps link, kept verbatim for humans. lat/lng is what
   *  validation reads; this is what someone clicks to see where it is. */
  maps_url     text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive and only among ACTIVE rows, so a retired client's name can
-- be reused without having to delete history.
CREATE UNIQUE INDEX IF NOT EXISTS client_locations_name_uq
  ON client_locations (lower(name)) WHERE is_active;

-- ── Remote work requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remote_work_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  work_mode    text NOT NULL,
  client_location_id uuid REFERENCES client_locations (id) ON DELETE SET NULL,
  reason       text,
  status       text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT remote_work_requests_mode_chk
    CHECK (work_mode IN ('wfh', 'client_site', 'field')),
  CONSTRAINT remote_work_requests_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Client Side without a client is not a location, it is a word. The whole
  -- point of the mode is that the place is known and checkable.
  CONSTRAINT remote_work_requests_client_chk
    CHECK (work_mode <> 'client_site' OR client_location_id IS NOT NULL),
  -- A decision must say who made it. Enforced here rather than trusted to the
  -- action, because an approved row with no approver is unauditable.
  CONSTRAINT remote_work_requests_decided_chk
    CHECK (status = 'pending' OR (decided_by_id IS NOT NULL AND decided_at IS NOT NULL))
);

-- One request per person per day: the mode is a property of the day, and two
-- competing approved rows would make "was this approved?" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS remote_work_requests_emp_date_uq
  ON remote_work_requests (employee_id, work_date);
CREATE INDEX IF NOT EXISTS remote_work_requests_status_idx
  ON remote_work_requests (status, work_date DESC);
CREATE INDEX IF NOT EXISTS remote_work_requests_pending_idx
  ON remote_work_requests (work_date DESC) WHERE status = 'pending';

-- Which client site a punch was actually taken at. Denormalised onto the punch
-- on purpose: the request can later be edited or the location retired, and a
-- punch has to keep saying where it was taken.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS client_location_id uuid
    REFERENCES client_locations (id) ON DELETE SET NULL;

-- ── The backstop ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION require_approved_remote_work() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Office punches and anything without a mode are untouched.
  IF NEW.work_mode IS NULL OR NEW.work_mode IN ('office', 'other') THEN
    RETURN NEW;
  END IF;

  -- See the header: an admin correction is itself an authorised act.
  IF NEW.source = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM remote_work_requests r
     WHERE r.employee_id = NEW.employee_id
       AND r.work_date   = NEW.log_date
       AND r.work_mode   = NEW.work_mode
       AND r.status      = 'approved'
  ) THEN
    RAISE EXCEPTION
      'Remote work (%) on % is not approved for this employee.',
      NEW.work_mode, NEW.log_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_logs_require_approved_remote ON attendance_logs;
CREATE TRIGGER attendance_logs_require_approved_remote
  BEFORE INSERT OR UPDATE OF work_mode ON attendance_logs
  FOR EACH ROW EXECUTE FUNCTION require_approved_remote_work();
