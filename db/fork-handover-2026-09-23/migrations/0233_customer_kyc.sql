-- 0233 — CUSTOMER KYC, the address book, the dropdown master and the recycle bin.
--
-- Manan, 2026-09-17: "First we have to create Customer in Customer KYC form
-- inside Billing Module" — with Customer Master, Customer Address Book,
-- Customer Master DD and a recycle bin beside it in the Billing rail.
--
-- ── ONE CUSTOMER, NOT TWO ─────────────────────────────────────────────────
--
-- The KYC record EXTENDS `billing_customers` rather than standing beside it as
-- a second CRM table. That was a decision, and it is the important one here:
-- `billing_documents.customer_id` already points at `billing_customers`, and a
-- separate `client_kyc` table would mean every company existed twice — once as
-- the thing you KYC and once as the thing you invoice — with somebody
-- responsible for keeping the GSTIN on both in step. Extending means a
-- freshly onboarded client is immediately billable and its GSTIN, address and
-- payment terms flow into an invoice without a second entry.
--
-- ── WHAT IS A COLUMN AND WHAT IS A ROW ────────────────────────────────────
--
-- Single-valued facts about the company (grade, industry, credit limit) are
-- columns. Anything the form can hold MORE THAN ONE of — contacts, addresses,
-- documents — is a child table, because the form has "+ Add contact" and
-- "+ Add address" buttons and a column cannot grow.
--
-- ── THE DROPDOWN MASTER IS ONE TABLE, KEYED BY LIST ───────────────────────
--
-- `billing_lookups` follows `accounts_lookups`, which the Accounts module has
-- used for the same job: one row per option, `kind` naming the list it belongs
-- to. Twelve tables for twelve dropdowns would mean twelve migrations the next
-- time somebody wants a thirteenth list; this way a new list is a new `kind`
-- and no schema change at all.
--
-- ── THE RECYCLE BIN IS A TIMESTAMP, NOT A TABLE ───────────────────────────
--
-- `deleted_at` on each table, and the bin is a view over the rows that carry
-- one. A separate "deleted rows" table would have to mirror every column of
-- every table it accepts and would break the moment one of them gained a
-- field. Nothing here removes a row; restoring is clearing the timestamp.
--
-- Deliberately NOT reusing `is_active`: that already means "do not offer this
-- customer on new documents" and is a live business state. Deleted is not
-- inactive, and conflating them would make a restore ambiguous.

-- ── BILLING CUSTOMERS: the KYC fields ─────────────────────────────────────
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
-- The recycle bin. See the header note on why this is not `is_active`.
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS deleted_at         timestamptz;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS deleted_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL;

-- Partial, because every working list filters `deleted_at is null` and the bin
-- is the rare read. Indexing only the live rows keeps it small.
CREATE INDEX IF NOT EXISTS billing_customers_live_idx
  ON billing_customers (name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS billing_customers_deleted_idx
  ON billing_customers (deleted_at) WHERE deleted_at IS NOT NULL;
-- Client codes are shown as an identifier (CL-0144), so two customers must not
-- share one. Partial so a deleted row does not hold its code hostage.
CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_code_uq
  ON billing_customers (client_code) WHERE client_code IS NOT NULL AND deleted_at IS NULL;

-- ── CONTACT PEOPLE ────────────────────────────────────────────────────────
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
  -- The form says the FIRST contact is the client's primary and is the one
  -- auto-fetched on enquiries, so which one that is has to be stored rather
  -- than inferred from insert order, which an edit would scramble.
  is_primary   boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_customer_contacts_cust_idx
  ON billing_customer_contacts (customer_id, sort_order);

-- ── ADDRESSES — what the Customer Address Book reads ──────────────────────
CREATE TABLE IF NOT EXISTS billing_customer_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  -- 'billing' | 'shipping'. Free text rather than an enum: the form lets you
  -- add further addresses, and a new kind should not need a migration.
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

-- ── DOCUMENTS — business card front/back and anything else attached ───────
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

-- ── THE DROPDOWN MASTER ───────────────────────────────────────────────────
-- One row per option. `kind` is the list: 'designation', 'payment_terms',
-- 'freight_charges', 'credit_days', 'credit_limit', 'quantity_deviation',
-- 'account_type', 'bank_name', 'transporter', 'state', 'country', 'currency',
-- and the two new ones: 'product_description', 'service_description'.
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
-- The same option twice in one list is always a mistake, and the master's
-- "add" box is easy to submit twice.
CREATE UNIQUE INDEX IF NOT EXISTS billing_lookups_kind_value_uq
  ON billing_lookups (kind, lower(value)) WHERE deleted_at IS NULL;
