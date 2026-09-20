-- 0234 — BILLING CONTRACTS: the agreement a run of invoices is raised under.
--
-- Billing → Create Contract / All Contracts. A contract fixes a Total Contract
-- Value with a customer and says HOW it is billed — Retainer, Milestone based,
-- Subscription or Full Payment — and carries the post-dated cheques (PDCs) the
-- customer handed over with it.
--
-- ── A CONTRACT DOES NOT ISSUE INVOICES OF ITS OWN ─────────────────────────
--
-- "Raise Bill" creates an ordinary draft TAX INVOICE in `billing_documents`
-- through the existing document engine (lib/billing/documents.ts), and the
-- schedule row keeps a pointer to it. Numbering, GST, the PDF, email, Mark
-- Paid and Cancel are therefore all the engine's, unchanged — and so is the
-- paid / unpaid / due status the Contracts view reports. A second invoice
-- table for contract bills would have meant two sets of numbers, two PDFs and
-- two ideas of "paid".
--
-- ── ONE SCHEDULE TABLE, NOT THREE ─────────────────────────────────────────
--
-- Milestones, subscription instalments, the single Full Payment and each
-- retainer period are the same thing — a sequenced, amount-bearing line that
-- becomes one invoice — so they are rows of `billing_contract_items` with a
-- `kind`, the arrangement `billing_lookups` already uses for dropdown lists.
--
-- ── THE CONTRACT VALUE IS A CEILING ───────────────────────────────────────
--
-- All schedule amounts are PRE-GST (the invoice adds tax on top), and their sum
-- may never exceed `total_value`. The application enforces that on every save
-- and every Raise Bill; the CHECKs below only stop the impossible values.
--
-- FULLY IDEMPOTENT — every statement is IF NOT EXISTS guarded. Additive only.

CREATE TABLE IF NOT EXISTS billing_contracts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The billing entity (lib/hr/entities.ts slug), as on billing_documents.
  entity_id          text NOT NULL,
  customer_id        uuid NOT NULL REFERENCES billing_customers(id) ON DELETE RESTRICT,
  -- Snapshot for lists, so a renamed customer does not rename old contracts.
  customer_name      text NOT NULL,
  total_value        numeric(14,2) NOT NULL CHECK (total_value > 0),
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  billing_date       date NOT NULL,
  -- retainer | milestone | subscription | full_payment
  payment_type       text NOT NULL,
  -- Retainer only: monthly | quarterly, and the amount billed each period.
  billing_frequency  text,
  retainer_amount    numeric(14,2) CHECK (retainer_amount IS NULL OR retainer_amount > 0),
  -- "Stop when Contract Value is completed" — on by default.
  stop_when_complete boolean NOT NULL DEFAULT true,
  -- active | completed | stopped | cancelled
  status             text NOT NULL DEFAULT 'active',
  stopped_at         timestamptz,
  stopped_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  cancelled_at       timestamptz,
  cancel_reason      text,
  notes              text,
  -- The signed contract, in the `documents` storage bucket.
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
  -- milestone | subscription | full_payment | retainer
  kind         text NOT NULL,
  seq          integer NOT NULL,
  due_date     date,
  description  text,
  amount       numeric(14,2) NOT NULL CHECK (amount >= 0),
  -- pending | billed | stopped. "Paid" is not stored here: it is the linked
  -- invoice's status, read live, so the two can never disagree.
  status       text NOT NULL DEFAULT 'pending',
  document_id  uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  raised_at    timestamptz,
  stopped_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_contract_items_contract_idx ON billing_contract_items (contract_id, seq);
-- One invoice belongs to at most one schedule row.
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
  -- received | deposited | cleared | bounced
  status       text NOT NULL DEFAULT 'received',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_contract_pdcs_contract_idx ON billing_contract_pdcs (contract_id, sr_no);
