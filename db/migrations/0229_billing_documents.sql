-- 0229 — BILLING: the document engine (Quotation → Proforma Invoice → Tax Invoice).
--
-- WHAT THIS ADDS. `/billing` already renders the Google-Sheets revenue ledger.
-- This migration gives the room its second half: real, numbered, GST-computing
-- documents that can be generated, previewed, emailed and converted forward.
--
-- The design rules that the columns below encode:
--
--   SNAPSHOT, DON'T JOIN. A printed document must never change because someone
--   later edited a master row, so `seller_snapshot` / `customer_snapshot` and
--   the per-line `code` / `name` / `sac_code` carry the values AS THEY WERE at
--   generate time. The FKs beside them are for navigation, not for rendering.
--
--   NEVER DELETE. Cancel is a status, conversion keeps its source, and the
--   lookups soft-delete via `is_active` so historical rows stay joinable.
--
--   NUMBER ON GENERATE. `billing_number_series` is bumped inside the generate
--   transaction, not when a draft is created — an abandoned draft must not burn
--   a tax-invoice number, and a gap in that series is an audit finding.
--
--   EXTEND, DON'T FORK. The product master is `outstanding_products`; it gains
--   five additive, nullable billing columns rather than a second table.
--
-- FULLY IDEMPOTENT — every statement is IF NOT EXISTS / ON CONFLICT guarded.

------------------------------------------------------------------------
-- 1. Lookups (admin-managed)
------------------------------------------------------------------------

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

-- Seed terms. All editable, all deactivatable. "Custom" is deliberately NOT a
-- row — it is a free-text override stored on the document itself.
INSERT INTO billing_payment_terms (label, due_days, is_default, sort_order) VALUES
  ('Immediate',  0,    true,  10),
  ('7 Days',     7,    false, 20),
  ('15 Days',    15,   false, 30),
  ('30 Days',    30,   false, 40),
  ('45 Days',    45,   false, 50),
  ('DP',         NULL, false, 60),
  ('Advance',    0,    false, 70)
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------
-- 2. Seller billing profile — one row per issuing entity
--
-- `entity_id` is the canonical slug from lib/hr/entities.ts ("altus-corp",
-- "unleashed", …). Text, not an FK, because that registry is CODE; UNIQUE so an
-- entity can only ever have one profile.
------------------------------------------------------------------------

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

------------------------------------------------------------------------
-- 3. Customer master (bill-to)
--
-- New, but LINKABLE: the optional FKs to clients / outstanding_entities keep
-- one real customer as one row across modules instead of a fourth master.
-- A NULL `gstin` is a first-class case (unregistered customer), not an error.
------------------------------------------------------------------------

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

------------------------------------------------------------------------
-- 4. Product master — EXTEND, never fork
--
-- Additive and nullable, so every existing Outstanding query keeps working.
------------------------------------------------------------------------

ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS sac_code         text;
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS default_rate     numeric(14,2);
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS default_gst_rate numeric(5,2);
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS is_billable      boolean NOT NULL DEFAULT true;

------------------------------------------------------------------------
-- 5. Number series — (entity, doc type, financial year) → next sequence
--
-- The base and prefix are admin-configurable. Quotations default to 90001 as a
-- ROW value, not a constant in code, so the observed "90001-26-27" reproduces
-- without hard-coding it anywhere.
------------------------------------------------------------------------

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

-- Per-(entity, type) defaults a new financial year inherits when its series row
-- is auto-created. Seeded per document type; edited from the Admin Panel.
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

------------------------------------------------------------------------
-- 6. Documents + lines + events
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_documents (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type  text NOT NULL,
  doc_no    text,                      -- NULL while draft; assigned on generate
  fin_year  text NOT NULL,
  seq       integer,
  doc_date  date NOT NULL,
  due_date  date,
  status    text NOT NULL DEFAULT 'draft',

  -- seller
  entity_id         text NOT NULL,
  entity_profile_id uuid REFERENCES billing_entity_profiles(id) ON DELETE SET NULL,
  seller_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- customer
  customer_id           uuid REFERENCES billing_customers(id) ON DELETE SET NULL,
  customer_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Editable-on-the-document copies, so "send to" is visible and overridable in
  -- the list and on the form without digging into the jsonb.
  customer_name         text NOT NULL,
  customer_contact_name text,
  customer_email        text,
  customer_whatsapp     text,
  customer_gstin        text,
  place_of_supply_state text,
  place_of_supply_code  text,

  -- service / terms
  service_description text,
  sac_code            text,
  payment_terms_id    uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  payment_terms_label text,
  remarks             text,

  -- tax + totals (all computed server-side, all stored for audit)
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

  -- lineage
  source_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  source_doc_no      text,
  source_doc_type    text,

  -- lifecycle
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

-- A number is unique within its series. Partial, because drafts have no number.
CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_no_uq
  ON billing_documents (entity_id, doc_type, fin_year, doc_no)
  WHERE doc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_documents_list_idx
  ON billing_documents (doc_type, status, doc_date DESC);
CREATE INDEX IF NOT EXISTS billing_documents_customer_idx
  ON billing_documents (customer_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS billing_documents_source_idx
  ON billing_documents (source_document_id);
-- Forward-convert ONCE. A cancelled child frees its source again.
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

------------------------------------------------------------------------
-- 7. Email log — what was actually sent, to whom, and whether it landed
------------------------------------------------------------------------

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

------------------------------------------------------------------------
-- 8. Backfill the customer master from the names already in the app
--
-- Names only — nothing here invents an email, a PAN or a GSTIN. The rows arrive
-- linked, so filling one in later enriches the same customer everywhere.
------------------------------------------------------------------------

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
