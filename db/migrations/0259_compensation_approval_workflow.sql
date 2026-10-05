CREATE TABLE IF NOT EXISTS compensation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('attendance', 'incentive', 'reimbursement', 'salary')),
  subject_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_month date,
  payable_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  decision_note text,
  decided_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  decided_at timestamptz,
  paid_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compensation_approval_subject_uq UNIQUE (kind, subject_id)
);

CREATE INDEX IF NOT EXISTS compensation_approval_status_idx
  ON compensation_approvals (kind, status, created_at);
CREATE INDEX IF NOT EXISTS compensation_approval_employee_idx
  ON compensation_approvals (employee_id, period_month);
