-- 0037 — audit_data_exports
-- Tracks DPDP-style "download my data" requests. /profile creates a row
-- with status=pending; the data-export cron picks it up, writes a ZIP
-- to documents bucket, emails the user.

CREATE TABLE IF NOT EXISTS audit_data_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  file_path     text,                                   -- documents-bucket storage path
  status        text NOT NULL DEFAULT 'pending'         -- pending|processing|done|failed
                CHECK (status IN ('pending','processing','done','failed')),
  error         text
);

CREATE INDEX IF NOT EXISTS audit_data_exports_employee_idx
  ON audit_data_exports (employee_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS audit_data_exports_pending_idx
  ON audit_data_exports (status, requested_at)
  WHERE status IN ('pending','processing');
