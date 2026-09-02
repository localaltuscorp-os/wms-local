-- db/migrations/0055_outstanding_rebuild.sql
-- Outstanding tracker native rebuild. Idempotent.

CREATE TABLE IF NOT EXISTS outstanding_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_products_active_name_idx ON outstanding_products (is_active, name);

CREATE TABLE IF NOT EXISTS outstanding_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_entities_active_name_idx ON outstanding_entities (is_active, name);

CREATE TABLE IF NOT EXISTS outstanding_payment_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_payment_modes_active_name_idx ON outstanding_payment_modes (is_active, name);

CREATE TABLE IF NOT EXISTS outstanding_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  contact_phone text,
  product_id uuid REFERENCES outstanding_products(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES outstanding_entities(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  expected_mode_id uuid REFERENCES outstanding_payment_modes(id) ON DELETE SET NULL,
  cycle text NOT NULL CHECK (cycle IN ('subscription','monthly_bill','full_payment')),
  base_amount numeric(14,2) NOT NULL,
  gst_rate integer NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  periods integer,
  end_date date,
  pdc_received boolean NOT NULL DEFAULT false,
  comments text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','written_off')),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_contracts_client_idx ON outstanding_contracts (client_name);
CREATE INDEX IF NOT EXISTS outstanding_contracts_status_idx ON outstanding_contracts (status);

CREATE TABLE IF NOT EXISTS outstanding_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES outstanding_contracts(id) ON DELETE CASCADE,
  period_index integer,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  is_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_installments_due_idx ON outstanding_installments (due_date);
CREATE INDEX IF NOT EXISTS outstanding_installments_contract_idx ON outstanding_installments (contract_id, period_index);

CREATE TABLE IF NOT EXISTS outstanding_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  contract_id uuid REFERENCES outstanding_contracts(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  payment_mode_id uuid REFERENCES outstanding_payment_modes(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  collected_at date NOT NULL,
  comments text,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_collections_client_idx ON outstanding_collections (client_name);
CREATE INDEX IF NOT EXISTS outstanding_collections_date_idx ON outstanding_collections (collected_at);

CREATE TABLE IF NOT EXISTS outstanding_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('contract','collection')),
  owner_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer,
  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outstanding_attachments_owner_idx ON outstanding_attachments (owner_type, owner_id);
