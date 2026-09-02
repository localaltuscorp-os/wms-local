-- 0062_salary — salary module: designation/entity rosters, per-employee salary
-- profiles, monthly salary runs, advances, policy + policy-consent records.
-- Money is numeric(14,2) rupees (house style). Additive + idempotent.

CREATE TABLE IF NOT EXISTS designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS designations_active_name_idx ON designations (is_active, name);

CREATE TABLE IF NOT EXISTS paying_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paying_entities_active_name_idx ON paying_entities (is_active, name);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation_id uuid
  REFERENCES designations(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS paying_entity_id uuid
  REFERENCES paying_entities(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS salary_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  annual_ctc numeric(14,2) NOT NULL DEFAULT 0,
  tds_monthly numeric(14,2) NOT NULL DEFAULT 0,
  pt_exempt boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  advance_date date NOT NULL,
  fy text NOT NULL,
  month text NOT NULL,
  amount numeric(14,2) NOT NULL,
  note text,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salary_advances_emp_month_idx ON salary_advances (employee_id, month);

CREATE TABLE IF NOT EXISTS salary_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fy text NOT NULL,
  month text NOT NULL,
  annual_ctc numeric(14,2) NOT NULL,
  days_in_month integer NOT NULL,
  payable_days numeric(6,2) NOT NULL,
  late_marks integer NOT NULL DEFAULT 0,
  late_deduction_days numeric(6,2) NOT NULL DEFAULT 0,
  gross numeric(14,2) NOT NULL,
  pt numeric(14,2) NOT NULL DEFAULT 0,
  tds numeric(14,2) NOT NULL DEFAULT 0,
  advances numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance_in numeric(14,2) NOT NULL DEFAULT 0,
  net_payable numeric(14,2) NOT NULL,
  disbursed boolean NOT NULL DEFAULT false,
  disbursed_amount numeric(14,2),
  approved_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  generated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'generated',
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS salary_runs_emp_month_uq ON salary_runs (employee_id, month);
CREATE INDEX IF NOT EXISTS salary_runs_month_idx ON salary_runs (month);
CREATE INDEX IF NOT EXISTS salary_runs_import_batch_idx ON salary_runs (import_batch_id);

CREATE TABLE IF NOT EXISTS salary_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_policy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signature_kind text NOT NULL,
  signature_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS salary_policy_consents_emp_version_uq
  ON salary_policy_consents (employee_id, policy_version);
