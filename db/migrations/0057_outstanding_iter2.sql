-- db/migrations/0057_outstanding_iter2.sql  (idempotent)
CREATE TABLE IF NOT EXISTS outstanding_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_responsibles_active_name_idx ON outstanding_responsibles (is_active, name);

ALTER TABLE outstanding_contracts
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS retainer_start date,
  ADD COLUMN IF NOT EXISTS retainer_end date,
  ADD COLUMN IF NOT EXISTS bill_date integer,
  ADD COLUMN IF NOT EXISTS emi_count integer,
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE outstanding_collections
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE outstanding_contracts DROP CONSTRAINT IF EXISTS outstanding_contracts_cycle_check;
ALTER TABLE outstanding_contracts ADD CONSTRAINT outstanding_contracts_cycle_check
  CHECK (cycle IN ('subscription','monthly_bill','full_payment','partial_payment','slabs'));
