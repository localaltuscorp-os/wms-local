-- ===========================================================================
--  BILLING MODULE — the SQL to run in Supabase
--  Altus WMS | branch Shreya | compiled 2026-09-21
-- ===========================================================================
--
--  WHAT THIS IS
--  Every schema change the Billing module needs, in one file, in run order.
--  It is the content of these eight migrations, nothing else:
--
--      0226_billing_master.sql                    company (paying entity) profile
--      0229_billing_documents.sql                 the document engine
--      0231_billing_pms_archive.sql               archive flags (billing half only)
--      0233_customer_kyc.sql                      customer KYC
--      0234_billing_contracts.sql                 contracts + PDC register
--      0235_customer_kyc_business_whatsapp.sql    KYC additions
--      0236_customer_kyc_social_payment_options.sql
--      0237_customer_kyc_introducer.sql
--
--  HOW TO RUN
--  Supabase Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--  Or:  psql "$DATABASE_URL" -f BILLING-SQL-TO-RUN.sql
--
--  CHECK THE PROJECT REF IN THE URL BAR FIRST. There are three Supabase
--  projects in this team's notes and two of them are not the one you want.
--
--  SAFE TO RE-RUN. Every statement is guarded — CREATE TABLE IF NOT EXISTS,
--  ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, ON CONFLICT DO
--  NOTHING. A second run changes nothing. No statement deletes a row.
--
--  THE ONLY STATEMENTS THAT WRITE DATA are at the end of the 0229 block:
--  seven default payment terms, and one billing_customers row per existing
--  client / outstanding entity so the customer dropdown is not empty on day
--  one. All three are ON CONFLICT DO NOTHING.
--
--  ORDER MATTERS. 0229 creates billing_documents and billing_customers;
--  0231, 0233, 0234 alter or reference them. Do not reorder the blocks.
--
--  NOT IN THIS FILE: the two enum values in SUPABASE-STEP-1-enum-values.sql.
--  Billing does not use them — they belong to the task/approval status work.
--
-- ===========================================================================


-- ============================================================
-- 0226 — Billing master: company (paying entity) profile fields, logo/signature files, edit history
-- ============================================================

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS proprietor_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS proprietor_designation text;

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS cell_no text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS pan_no text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS gst_no text;

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS sac_codes text[] NOT NULL DEFAULT '{}';

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS ifsc text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS branch text;

ALTER TABLE paying_entities
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS billing_entity_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_id uuid NOT NULL REFERENCES paying_entities(id) ON DELETE CASCADE,

  kind text NOT NULL,

  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,

  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_entity_files DROP CONSTRAINT IF EXISTS billing_entity_files_kind_chk;
ALTER TABLE billing_entity_files
  ADD CONSTRAINT billing_entity_files_kind_chk
  CHECK (kind IN ('logo', 'signature', 'document'));

CREATE UNIQUE INDEX IF NOT EXISTS billing_entity_files_one_per_role_idx
  ON billing_entity_files (entity_id, kind)
  WHERE kind IN ('logo', 'signature');

CREATE INDEX IF NOT EXISTS billing_entity_files_entity_idx
  ON billing_entity_files (entity_id, kind, created_at);

CREATE TABLE IF NOT EXISTS billing_entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_id uuid NOT NULL,

  entity_name text NOT NULL,

  snapshot jsonb NOT NULL,

  reason text NOT NULL,

  actor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_entity_versions_entity_created_idx
  ON billing_entity_versions (entity_id, created_at DESC);

-- ============================================================
-- 0229 — The billing engine: payment terms, SAC codes, company profiles, customers, number series, documents, lines, events, email log
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_payment_terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,             -- "Immediate", "30 Days", "DP", …
  due_days    integer,                   -- NULL = no computable due date
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_terms_label_uq
  ON billing_payment_terms (lower(label));

CREATE TABLE IF NOT EXISTS billing_sac_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  description      text NOT NULL,
  default_gst_rate numeric(5,2),
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 100,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_sac_codes_code_uq ON billing_sac_codes (code);

INSERT INTO billing_payment_terms (label, due_days, is_default, sort_order) VALUES
  ('Immediate',  0,    true,  10),
  ('7 Days',     7,    false, 20),
  ('15 Days',    15,   false, 30),
  ('30 Days',    30,   false, 40),
  ('45 Days',    45,   false, 50),
  ('DP',         NULL, false, 60),
  ('Advance',    0,    false, 70)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_entity_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             text NOT NULL UNIQUE,
  paying_entity_id      uuid REFERENCES paying_entities(id) ON DELETE SET NULL,
  legal_name            text,           -- overrides the code registry when set
  pan                   text,
  gstin                 text,
  state_name            text,           -- the SELLER's state
  state_code            text,           -- 2-digit GST state code
  address_line          text,
  email                 text,
  whatsapp              text,
  phone                 text,
  website               text,
  logo_url              text,           -- overrides public/logos/<entity_id>.jpg
  bank_name             text,
  bank_account_name     text,
  bank_account_no       text,
  bank_ifsc             text,
  bank_branch           text,
  upi_id                text,
  default_sac_code      text,
  signatory_name        text,
  signatory_designation text,
  signature_image_url   text,           -- else fall back to public/signatures/*
  default_payment_terms_id uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  interest_clause       text,           -- "interest @ x% p.a. after due date"
  invoice_footer_note   text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by_id         uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id         uuid REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS billing_customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,
  contact_name  text,           -- "Kind Attn." on the printed document
  email         text,
  whatsapp      text,           -- E.164, "+919876543210"
  phone         text,
  pan           text,
  gstin         text,
  address_line1 text,
  address_line2 text,
  city          text,
  state_name    text,
  state_code    text,           -- drives intra- vs inter-state GST
  pincode       text,
  country       text NOT NULL DEFAULT 'India',
  client_id             uuid REFERENCES clients(id) ON DELETE SET NULL,
  outstanding_entity_id uuid REFERENCES outstanding_entities(id) ON DELETE SET NULL,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_name_uq ON billing_customers (lower(name));
CREATE INDEX IF NOT EXISTS billing_customers_active_idx ON billing_customers (is_active, name);

ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS sac_code         text;
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS default_rate     numeric(14,2);
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS default_gst_rate numeric(5,2);
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS is_billable      boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS billing_number_series (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  text NOT NULL,
  doc_type   text NOT NULL,       -- quotation | proforma_invoice | tax_invoice
  fin_year   text NOT NULL,       -- "26-27"
  prefix     text NOT NULL DEFAULT '',
  next_seq   integer NOT NULL DEFAULT 1,
  pad_width  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, doc_type, fin_year)
);

CREATE TABLE IF NOT EXISTS billing_series_defaults (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   text NOT NULL,
  doc_type    text NOT NULL,
  prefix      text NOT NULL DEFAULT '',
  start_seq   integer NOT NULL DEFAULT 1,
  pad_width   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, doc_type)
);

CREATE TABLE IF NOT EXISTS billing_documents (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type  text NOT NULL,
  doc_no    text,                      -- NULL while draft; assigned on generate
  fin_year  text NOT NULL,
  seq       integer,
  doc_date  date NOT NULL,
  due_date  date,
  status    text NOT NULL DEFAULT 'draft',

  entity_id         text NOT NULL,
  entity_profile_id uuid REFERENCES billing_entity_profiles(id) ON DELETE SET NULL,
  seller_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,

  customer_id           uuid REFERENCES billing_customers(id) ON DELETE SET NULL,
  customer_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_name         text NOT NULL,
  customer_contact_name text,
  customer_email        text,
  customer_whatsapp     text,
  customer_gstin        text,
  place_of_supply_state text,
  place_of_supply_code  text,

  service_description text,
  sac_code            text,
  payment_terms_id    uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  payment_terms_label text,
  remarks             text,

  gst_mode          text NOT NULL DEFAULT 'cgst_sgst',
  gst_applicable    boolean NOT NULL DEFAULT true,
  is_reverse_charge boolean NOT NULL DEFAULT false,
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  discount_total    numeric(14,2) NOT NULL DEFAULT 0,
  taxable_value     numeric(14,2) NOT NULL DEFAULT 0,
  cgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  round_off         numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL DEFAULT 0,
  amount_in_words   text,
  currency          text NOT NULL DEFAULT 'INR',

  source_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  source_doc_no      text,
  source_doc_type    text,

  generated_at     timestamptz,
  sent_at          timestamptz,
  last_sent_to     text,
  paid_at          timestamptz,
  paid_amount      numeric(14,2),
  cancelled_at     timestamptz,
  cancel_reason    text,
  pdf_storage_path text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_no_uq
  ON billing_documents (entity_id, doc_type, fin_year, doc_no)
  WHERE doc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_documents_list_idx
  ON billing_documents (doc_type, status, doc_date DESC);
CREATE INDEX IF NOT EXISTS billing_documents_customer_idx
  ON billing_documents (customer_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS billing_documents_source_idx
  ON billing_documents (source_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_one_child_uq
  ON billing_documents (source_document_id)
  WHERE source_document_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS billing_document_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES outstanding_products(id) ON DELETE SET NULL,
  code        text,                                     -- snapshot
  name        text NOT NULL,                            -- snapshot
  description text,
  sac_code    text,
  hsn_code    text,
  quantity    numeric(12,3)  NOT NULL DEFAULT 1,
  unit        text,
  rate        numeric(14,2)  NOT NULL DEFAULT 0,
  discount_pct    numeric(5,2),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount      numeric(14,2) NOT NULL DEFAULT 0,         -- qty × rate − discount
  gst_rate    numeric(5,2)  NOT NULL DEFAULT 0,
  cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total  numeric(14,2) NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_document_lines_doc_idx
  ON billing_document_lines (document_id, sort_order);

CREATE TABLE IF NOT EXISTS billing_document_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_document_events_doc_idx
  ON billing_document_events (document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_email_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  recipient   text NOT NULL,
  cc          text,
  bcc         text,
  subject     text NOT NULL,
  body        text,
  attachment  text,                     -- the PDF filename that was attached
  status      text NOT NULL DEFAULT 'sent',   -- sent | failed
  error       text,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  sent_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_email_log_doc_idx
  ON billing_email_log (document_id, sent_at DESC);

INSERT INTO billing_customers (name, client_id)
SELECT DISTINCT ON (lower(c.name)) c.name, c.id FROM clients c
WHERE c.name IS NOT NULL AND btrim(c.name) <> ''
ORDER BY lower(c.name), c.created_at
ON CONFLICT DO NOTHING;

INSERT INTO billing_customers (name, outstanding_entity_id)
SELECT DISTINCT ON (lower(e.name)) e.name, e.id FROM outstanding_entities e
WHERE e.name IS NOT NULL AND btrim(e.name) <> ''
ORDER BY lower(e.name), e.created_at
ON CONFLICT DO NOTHING;

-- ============================================================
-- 0231 — Archive flags on billing documents
-- ============================================================

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS billing_documents_archived_idx
  ON billing_documents (archived)
  WHERE archived = true;

-- ============================================================
-- 0233 — Customer KYC: extra customer fields, contacts, addresses, documents, dropdown lookups
-- ============================================================

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS client_code        text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS grade              text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS tags              text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS customer_types    text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS industry_types    text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS product_types     text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS sales_person_id    uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS is_export          boolean NOT NULL DEFAULT false;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS msme_no            text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS gst_reg_type       text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS currency           text NOT NULL DEFAULT 'INR';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS payment_terms      text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS freight_charges    text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS credit_days        text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS credit_limit       text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS transporter        text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS quantity_deviation text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS other_references   text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS deleted_at         timestamptz;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS deleted_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS billing_customers_live_idx
  ON billing_customers (name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS billing_customers_deleted_idx
  ON billing_customers (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_code_uq
  ON billing_customers (client_code) WHERE client_code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS billing_customer_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  first_name   text,
  last_name    text,
  phone        text,
  email        text,
  designation  text,
  department   text,
  notes        text,
  is_primary   boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_customer_contacts_cust_idx
  ON billing_customer_contacts (customer_id, sort_order);

CREATE TABLE IF NOT EXISTS billing_customer_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'billing',
  label        text,
  line1        text,
  line2        text,
  line3        text,
  line4        text,
  city         text,
  state_name   text,
  state_code   text,
  country      text NOT NULL DEFAULT 'India',
  pincode      text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_customer_addresses_cust_idx
  ON billing_customer_addresses (customer_id, kind, sort_order);

CREATE TABLE IF NOT EXISTS billing_customer_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  slot          text NOT NULL DEFAULT 'other',   -- 'front' | 'back' | 'other'
  file_name     text NOT NULL,
  storage_path  text NOT NULL,
  content_type  text,
  size_bytes    integer,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_customer_documents_cust_idx
  ON billing_customer_documents (customer_id, slot);

CREATE TABLE IF NOT EXISTS billing_lookups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  value       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_lookups_kind_idx
  ON billing_lookups (kind, sort_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS billing_lookups_kind_value_uq
  ON billing_lookups (kind, lower(value)) WHERE deleted_at IS NULL;

-- ============================================================
-- 0234 — Contracts: contract header, instalments/retainers, PDC register
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_contracts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          text NOT NULL,
  customer_id        uuid NOT NULL REFERENCES billing_customers(id) ON DELETE RESTRICT,
  customer_name      text NOT NULL,
  total_value        numeric(14,2) NOT NULL CHECK (total_value > 0),
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  billing_date       date NOT NULL,
  payment_type       text NOT NULL,
  billing_frequency  text,
  retainer_amount    numeric(14,2) CHECK (retainer_amount IS NULL OR retainer_amount > 0),
  stop_when_complete boolean NOT NULL DEFAULT true,
  status             text NOT NULL DEFAULT 'active',
  stopped_at         timestamptz,
  stopped_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  cancelled_at       timestamptz,
  cancel_reason      text,
  notes              text,
  attachment_path    text,
  attachment_name    text,
  attachment_type    text,
  attachment_size    integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT billing_contracts_dates_chk CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS billing_contracts_customer_idx ON billing_contracts (customer_id, start_date DESC);
CREATE INDEX IF NOT EXISTS billing_contracts_status_idx ON billing_contracts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_contract_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES billing_contracts(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  seq          integer NOT NULL,
  due_date     date,
  description  text,
  amount       numeric(14,2) NOT NULL CHECK (amount >= 0),
  status       text NOT NULL DEFAULT 'pending',
  document_id  uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  raised_at    timestamptz,
  stopped_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_contract_items_contract_idx ON billing_contract_items (contract_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS billing_contract_items_document_uq
  ON billing_contract_items (document_id) WHERE document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_contract_pdcs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES billing_contracts(id) ON DELETE CASCADE,
  sr_no        integer NOT NULL,
  cheque_date  date,
  cheque_no    text,
  bank_name    text,
  amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  drawer_name  text,
  status       text NOT NULL DEFAULT 'received',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_contract_pdcs_contract_idx ON billing_contract_pdcs (contract_id, sr_no);

-- ============================================================
-- 0235 — KYC: business category, nature of business, contact WhatsApp
-- ============================================================

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS business_category text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS nature_of_business text;
ALTER TABLE billing_customer_contacts ADD COLUMN IF NOT EXISTS whatsapp text;

-- ============================================================
-- 0236 — KYC: LinkedIn, Instagram, subscription / EMI / module-wise payment
-- ============================================================

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS subscription text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS emi text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS module_wise_payment text;

-- ============================================================
-- 0237 — KYC: introducer
-- ============================================================

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS introducer jsonb;

-- ===========================================================================
--  VERIFY — read-only. Run after. Expect 19 rows, every status OK.
-- ===========================================================================

SELECT needed.t AS table_name,
       CASE WHEN c.table_name IS NULL THEN '*** MISSING ***' ELSE 'OK' END AS status
FROM (VALUES
  ('billing_payment_terms'),
  ('billing_sac_codes'),
  ('billing_entity_profiles'),
  ('billing_entity_files'),
  ('billing_entity_versions'),
  ('billing_customers'),
  ('billing_customer_contacts'),
  ('billing_customer_addresses'),
  ('billing_customer_documents'),
  ('billing_lookups'),
  ('billing_number_series'),
  ('billing_series_defaults'),
  ('billing_documents'),
  ('billing_document_lines'),
  ('billing_document_events'),
  ('billing_email_log'),
  ('billing_contracts'),
  ('billing_contract_items'),
  ('billing_contract_pdcs')
) AS needed(t)
LEFT JOIN information_schema.tables c
  ON c.table_schema = 'public' AND c.table_name = needed.t
ORDER BY 2 DESC, 1;

-- Seeded rows: expect 7 payment terms, and customers >= your client count.
SELECT
  (SELECT count(*) FROM billing_payment_terms) AS payment_terms,
  (SELECT count(*) FROM billing_customers)     AS customers,
  (SELECT count(*) FROM billing_documents)     AS documents;
