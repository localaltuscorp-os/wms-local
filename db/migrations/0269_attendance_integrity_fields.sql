-- 0269 — Attendance punch integrity metadata.
--
-- The application has been writing these optional anti-proxy fields since the
-- mobile-attendance work, but older databases can still lack the columns. Keep
-- this additive and idempotent: ordinary web punches leave all three NULL.

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS integrity_verdict text,
  ADD COLUMN IF NOT EXISTS mock_location boolean,
  ADD COLUMN IF NOT EXISTS anomaly_flags jsonb;
