-- Preserve the request that authorized a remote punch. Pending requests may
-- record a start; grading decides validity from request status.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS remote_work_request_id uuid
    REFERENCES remote_work_requests (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_logs_remote_request_idx
  ON attendance_logs (remote_work_request_id);

CREATE OR REPLACE FUNCTION require_approved_remote_work() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request_status text;
BEGIN
  IF NEW.work_mode IS NULL OR NEW.work_mode IN ('office', 'other') THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT r.status INTO request_status
    FROM remote_work_requests r
   WHERE r.id = NEW.remote_work_request_id
     AND r.employee_id = NEW.employee_id
     AND r.work_date = NEW.log_date
     AND r.work_mode = NEW.work_mode;

  IF request_status IS NULL OR request_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION
      'Remote work (%) on % needs a matching pending or approved request.',
      NEW.work_mode, NEW.log_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_logs_require_approved_remote ON attendance_logs;
CREATE TRIGGER attendance_logs_require_approved_remote
  BEFORE INSERT OR UPDATE OF work_mode, remote_work_request_id ON attendance_logs
  FOR EACH ROW EXECUTE FUNCTION require_approved_remote_work();
