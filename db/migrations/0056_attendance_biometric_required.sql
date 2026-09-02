-- 0056: anti-proxy attendance — mandatory biometric punch + per-person exemption.
--
-- Background: a punch only needed a GPS fix inside the geofence when the
-- employee had no registered passkey, so a friend at the office could punch
-- for an absent colleague with a shared password. Biometric is now REQUIRED
-- (enforced in app code: app/(app)/attendance/actions.ts). This column lets an
-- admin exempt employees whose device has no fingerprint/Face-ID sensor —
-- those fall back to GPS-only.
--
-- Additive + idempotent.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS attendance_biometric_exempt boolean NOT NULL DEFAULT false;
