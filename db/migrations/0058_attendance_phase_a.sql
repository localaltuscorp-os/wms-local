-- 0058 Attendance Phase A — additive schema only, no data touched, idempotent.
-- Org-wide schedule defaults, per-employee weekly-off + schedule overrides, and
-- admin-punch provenance on attendance_logs. NOTIFICATION_KINDS is a TS const
-- array (notifications.kind is `text`, not a pgEnum) so no ALTER TYPE is needed
-- for the new attendance_* kinds.

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS att_late_after time DEFAULT '10:50',
  ADD COLUMN IF NOT EXISTS att_early_before time DEFAULT '19:20',
  ADD COLUMN IF NOT EXISTS att_full_day_hours numeric DEFAULT 9,
  ADD COLUMN IF NOT EXISTS att_half_day_hours numeric DEFAULT 5;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS weekly_off integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS att_official_start time,
  ADD COLUMN IF NOT EXISTS att_late_after time,
  ADD COLUMN IF NOT EXISTS att_official_end time,
  ADD COLUMN IF NOT EXISTS att_early_before time;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS recorded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
