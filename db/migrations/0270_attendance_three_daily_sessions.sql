-- Attendance now supports up to three alternating check-in/check-out sessions
-- per employee per local calendar day. The former unique index allowed only one
-- in and one out, so it must be removed before the application can record a
-- second session. The application enforces alternating punches and the three
-- session ceiling; this index keeps the common employee timeline read fast.

DROP INDEX IF EXISTS attendance_logs_employee_day_kind_uq;

CREATE INDEX IF NOT EXISTS attendance_logs_employee_logged_at_idx
  ON attendance_logs (employee_id, logged_at DESC);
