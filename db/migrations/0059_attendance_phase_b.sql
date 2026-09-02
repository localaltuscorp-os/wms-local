-- 0059 Attendance Phase B — additive schema only, idempotent, no data touched.
-- Holiday calendar, paid/unpaid leave requests, and comp-off credits. The new
-- `attendance_late_deduction` notification kind needs no DB change — notifications.kind
-- is `text` (not a pgEnum), so there is no ALTER TYPE step here.

CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holidays_date_idx ON holidays (holiday_date);

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,1) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  decided_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_requests_employee_start_idx ON leave_requests (employee_id, start_date);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests (status);

CREATE TABLE IF NOT EXISTS comp_off_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  earned_date date NOT NULL,
  redeemed_date date,
  status text NOT NULL DEFAULT 'open',
  note text,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comp_off_credits_employee_status_idx ON comp_off_credits (employee_id, status);
