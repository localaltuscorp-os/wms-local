-- 0054 — Biometric + geofenced attendance.
-- Additive only, idempotent. Three parts:
--   1. org_settings gains the office anchor (lat/lng) + allowed punch radius.
--   2. attendance_logs gains the captured location + verification metadata.
--   3. webauthn_credentials — one row per registered device passkey, used to
--      require a real fingerprint/Face-ID at punch time.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS office_lat double precision;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS office_lng double precision;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS attendance_radius_m integer NOT NULL DEFAULT 100;

ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS accuracy_m real;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS distance_m real;
-- 'biometric' = WebAuthn user-verified · 'gps_only' = location gate passed but
-- device has no platform authenticator · 'none' = legacy rows from before this.
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS verify_method text NOT NULL DEFAULT 'none';
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS credential_id text;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_employee_idx
  ON webauthn_credentials (employee_id);
