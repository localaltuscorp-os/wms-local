-- ============================================================================
-- STEP 2 of 2 — THE SIX MIGRATIONS MISSING FROM THIS SUPABASE PROJECT.
-- ============================================================================
--
-- Run STEP 1 first and let it commit, or the 0225 UPDATEs below will fail with
-- "unsafe use of new value of enum type".
--
-- WHAT THIS FIXES
--   0225  tasks.approval_by_id / approval_at        → the task-drawer crash
--   0229  the billing_* tables                      → /billing/documents
--   0215  weekly_goals.archived_at                  → Archive › Goals
--   0230  daily_checklist initiator status
--   0231  archive flags on billing_documents + pms_monthly_review
--   0232  employees.performance_archived            → Archive › Team Performance
--
-- ORDER MATTERS: 0229 creates billing_documents and 0231 alters it.  Keep the
-- file in the order it is written.
--
-- EVERY DDL STATEMENT IS GUARDED (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF
-- NOT EXISTS / CREATE INDEX IF NOT EXISTS), so re-running this changes nothing
-- the second time.
--
-- ⚠ ONE STATEMENT IS NOT ADDITIVE.  0225 rewrites live rows: every task with
--   status 'on_hold' becomes status 'initiated' carrying approval_status
--   'on_hold'.  At the time this file was generated that was 12 tasks in this
--   database.  This is the intended migration, but it is data, not schema, and
--   re-running will not undo it.


-- ======================================================================
-- 0215_goal_archive.sql
-- ======================================================================

-- 0215 — Goals: a real ARCHIVE, separate from the Recycle Bin.
--
-- ADDITIVE ONLY. One nullable timestamp per table plus two partial indexes, so
-- this rewrites zero rows and takes only a brief ACCESS EXCLUSIVE lock on the
-- catalogue.
--
-- WHY THIS COLUMN EXISTS
--
-- `goals.archived` / `weekly_goals.archived` are ALREADY taken, and they do not
-- mean what their name suggests: the Goals module sets that flag from its
-- Delete action and the Recycle Bin (/goals/recycle-bin) is the screen that
-- lists them. It is a soft-DELETE marker.
--
-- Sir (2026-09) asked for an Archive option on the goals table's selection bar,
-- beside Delete — the same gesture the WMS task list has, where archiving is
-- "put this away, it is finished with" and NOT "delete this". Overloading
-- `archived` would have made one flag mean two things and put every deleted
-- goal in the Archive: Delete and Archive would have been the same button
-- printed twice.
--
-- So the two states are now distinct and can both be true independently:
--
--   archived = true      the goal was DELETED  → /goals/recycle-bin
--   archived_at IS NOT NULL  the goal was ARCHIVED → /archive/goals
--
-- A TIMESTAMP, NOT A BOOLEAN, matching `tasks.abandoned_at`,
-- `employees.deactivated_at` and the rest of the schema: "when" is free to
-- record and answers the question a boolean cannot.
--
-- The indexes are PARTIAL — the archived rows are the small minority, and a
-- partial index on the non-null half stays tiny while still serving the
-- Archive's "everything this person put away" scan.

ALTER TABLE goals        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_archived_at_idx
  ON goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS weekly_goals_archived_at_idx
  ON weekly_goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;


-- ======================================================================
-- 0225_doer_initiator_status.sql
-- ======================================================================

-- 0225 — THE TWO STATUS AXES: doer status and initiator status.
--
-- Manan, 2026-09-14. Every row of work is described twice: the doer reports
-- where it is, the initiator rules what to do about it. Those two answers were
-- tangled together — `on_hold` was a DOER value on tasks and an INITIATOR value
-- on project nodes, and goals had no initiator axis at all.
--
-- After this migration, in every module:
--
--   DOER       Not Read · Not Started · Initiated · Follow Up · Need Info ·
--              Done · Abandoned            → `status`
--   INITIATOR  Approved · Not Approved · On Hold · Archived
--                                          → `approval_status` + `archived`
--
-- Archived stays the BOOLEAN each table already has. It has a filter and an
-- index; a second string saying "archived" beside a boolean saying false is a
-- bug waiting to happen. See lib/status/axes.ts.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The two new enum values
------------------------------------------------------------------------
-- Split out on their own because a new enum value cannot be referenced in the
-- transaction that adds it. Both runners (scripts/apply-all-migrations.ts and
-- scripts/dummy-db-setup.ts) lift `alter type ... add value` lines out and run
-- them alone, which is why these sit on one line each.

-- (moved to STEP 1, run separately) alter type task_status add value if not exists 'abandoned';
-- (moved to STEP 1, run separately) alter type approval_status add value if not exists 'on_hold';

------------------------------------------------------------------------
-- 2. Goals grow an initiator axis
------------------------------------------------------------------------
-- Neither table had one. NULL is the correct default and a meaningful state:
-- "nobody has ruled on this yet", which the board shows as its own No Verdict
-- column rather than folding it into Not Approved.

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

-- Who ruled, and when. Without these an initiator status is an assertion with
-- no author — the same gap 0215 closed for device revocation.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_approval_status_idx
  ON goals (approval_status);
CREATE INDEX IF NOT EXISTS weekly_goals_approval_status_idx
  ON weekly_goals (approval_status);

------------------------------------------------------------------------
-- 3. Tasks: the same authorship columns
------------------------------------------------------------------------
-- `tasks.approval_status` already existed; who set it did not.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 4. Project nodes: authorship too
------------------------------------------------------------------------
-- `project_nodes.approval_status` is TEXT (it pre-dates the shared enum and
-- carries container rows that never had a task), so there is no type change
-- here — only the missing authorship.

ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 5. Move every held task onto the initiator axis
------------------------------------------------------------------------
-- Safe to run here even though section 1 added the value: the runners lift
-- `alter type ... add value` out and commit it in its own transaction BEFORE
-- this block, which is the whole reason they do that.
--
-- THE DOER STATUS WE LEAVE BEHIND. A held row's `status` has to become
-- something, and the row does not record what it was before someone held it.
-- `initiated` is the honest guess — work is put on hold because it had started
-- and then had to stop; a task nobody had opened would have been archived, not
-- held. Only rows with no verdict yet are touched, so an existing ruling is
-- never overwritten by this guess.

UPDATE tasks
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

-- A held task that ALREADY carried a verdict keeps the verdict; only its doer
-- status moves off the retired value, so it stops rendering as a deprecated
-- status in pickers that filter them out.
UPDATE tasks
   SET status = 'initiated'
 WHERE status = 'on_hold';

-- Goals and weekly goals share the task_status enum and so could hold the same
-- retired value. Same treatment, same reasoning.
UPDATE goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE weekly_goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE weekly_goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

-- Project nodes already treated on_hold as an initiator verdict, so a container
-- holding it in `status` is the drift this migration exists to end.
UPDATE project_nodes
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE project_nodes
   SET status = 'initiated'
 WHERE status = 'on_hold';


-- ======================================================================
-- 0229_billing_documents.sql
-- ======================================================================

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


-- ======================================================================
-- 0230_daily_checklist_initiator_status.sql
-- ======================================================================

-- 0230 — DAILY GOALS join the two status axes.
--
-- Manan, 2026-09-15: "in goals section there is a weekly goals and daily goals
-- please add doer and initiator status there also".
--
-- Weekly goals got both axes in 0225. Daily goals did not, and the asymmetry
-- was invisible until someone looked for the column: `daily_checklist` has
-- carried a `status` (the DOER axis) since it was created, but nothing an
-- initiator could rule with. So a commitment could report where it was and
-- never be approved, declined, held or filed.
--
--   DOER       Not Read · Not Started · Initiated · Follow Up · Need Info ·
--              Done · Abandoned            → `status`        (already present)
--   INITIATOR  Approved · Not Approved · On Hold · Archived
--                                          → `approval_status` + `archived_at`
--
-- ── WHY `archived_at` AND NOT A BOOLEAN ───────────────────────────────────
--
-- 0225 used the boolean each table already had. This table's only archive-ish
-- column is `abandoned_at`, and that is the RECYCLE BIN (migration 0186): every
-- planner read filters `abandoned_at IS NULL`, and a cancelled card lands there
-- to be restored. Wiring the initiator's Archived to it would DELETE a
-- commitment when someone meant to file it — exactly the mistake lib/status/
-- axes.ts warns about for `goals.archived` vs `goals.archived_at`.
--
-- So daily goals get their own `archived_at`, matching `goals` and
-- `weekly_goals`, where "put away" and "soft-deleted" are already two columns.
--
-- NULL IS THE CORRECT DEFAULT and a meaningful state: nobody has ruled on this
-- yet, which the control shows as "No Verdict" rather than folding into Not
-- Approved.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time. No enum values are
-- added (0225 already added `on_hold` to approval_status), so this file has
-- nothing that must run alone in its own transaction.

------------------------------------------------------------------------
-- 1. The verdict, and who made it
------------------------------------------------------------------------
-- Authorship is not optional: an initiator status with no author is an
-- assertion nobody signed, which is the gap 0225 closed for the other tables.

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 2. "Put away" — distinct from the Recycle Bin above it
------------------------------------------------------------------------

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

------------------------------------------------------------------------
-- 3. Indexes
------------------------------------------------------------------------
-- The verdict index mirrors goals_approval_status_idx / weekly_goals_…, for the
-- same reason: the initiator board groups by this column.
--
-- The archive index is PARTIAL. Almost every row is live, so an index over the
-- whole column would be one enormous all-NULL entry; `WHERE archived_at IS NOT
-- NULL` indexes only the filed ones, which is the set the Archive screen reads.

CREATE INDEX IF NOT EXISTS daily_checklist_approval_status_idx
  ON daily_checklist (approval_status);

CREATE INDEX IF NOT EXISTS daily_checklist_archived_at_idx
  ON daily_checklist (archived_at)
  WHERE archived_at IS NOT NULL;


-- ======================================================================
-- 0231_billing_pms_archive.sql
-- ======================================================================

-- 0231 — ARCHIVE for billing documents and monthly performance reviews.
--
-- Manan, 2026-09-15, pointing at Billing › Documents and at Performance:
-- "give archive for this as well".
--
-- Both screens list records that accumulate forever and had no way to be put
-- away — only a Cancel (billing) or nothing at all (reviews). Archive is the
-- app's standing answer to that: the row leaves the working list, keeps every
-- field, and comes back from Archive.
--
-- ── WHY TWO COLUMNS AND NOT ONE ───────────────────────────────────────────
--
-- `archived` is the flag every read filters on and every index is built for;
-- `archived_at` says WHEN, which is what an archive screen sorts by and what
-- makes "put away last March" answerable. The rest of the app carries both
-- (tc_materials, dcc_kpi_items, tasks) and the Archive browser reads the flag,
-- so a new table joining that set needs to look like the others.
--
-- ── BILLING: ARCHIVE IS NOT CANCEL, AND NEVER DELETES ─────────────────────
--
-- `billing_documents.status` already has 'cancelled', and it means something
-- else entirely: the document was withdrawn and is void. Archiving says only
-- "stop showing me this" — a paid invoice from two years ago is still a valid
-- legal record and must stay exactly as issued. So this is a separate flag
-- rather than a seventh status, and nothing here removes a row.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Billing documents
------------------------------------------------------------------------

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- PARTIAL, like daily_checklist's in 0230: almost every document is live, so an
-- index over the whole column would be one enormous all-false entry. This
-- indexes only the filed ones, which is the set the archived view reads.
CREATE INDEX IF NOT EXISTS billing_documents_archived_idx
  ON billing_documents (archived)
  WHERE archived = true;

------------------------------------------------------------------------
-- 2. Monthly performance reviews
------------------------------------------------------------------------
-- `pms_monthly_review` is the LIVE review table — the 360 one /pms/review and
-- /pms/v3 write, keyed by 'YYYY-MM'. (`pms_review` is a different, older table
-- that nothing writes any more; only the Archive browser still reads it, so it
-- is deliberately left alone here.)
--
-- Archiving is per ROW rather than per period: a period is not a record, it is
-- a string on a set of rows, and "archive September" is therefore "archive the
-- rows whose period is September" — which the action does in one statement.

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS pms_monthly_review_archived_idx
  ON pms_monthly_review (archived)
  WHERE archived = true;


-- ======================================================================
-- 0232_team_performance_archive.sql
-- ======================================================================

-- 0232 — ARCHIVE a row on Productivity › Team Performance.
--
-- Manan, 2026-09-15, pointing at the Team Performance table: "give archive
-- option to archive the team performance table".
--
-- ── WHAT IS BEING ARCHIVED, AND WHAT IS NOT ───────────────────────────────
--
-- The rows on that board are not records. Every number in them — goal score,
-- goals done, overdue, status — is computed live from tasks, goals, DCC and
-- attendance at render time, and nothing about the row is stored anywhere. So
-- there is nothing to file away. What CAN be put away is the row's PLACE ON
-- THE BOARD: "stop listing this person here".
--
-- Hence a flag on `employees` rather than a new table. It says one thing —
-- this person is off the Team Performance list — and it says it in the only
-- place the board reads its population from.
--
-- ── WHY NOT is_active, AND WHY NOT employment_status ──────────────────────
--
-- Both already exist and both mean something this must not: `is_active` is the
-- LOGIN GATE (0212's note is explicit), and `employment_status` answers "do
-- they still work here". Archiving a board row must not sign anybody out or
-- mark them a leaver, so it gets its own column and touches neither.
--
-- Nothing else reads it. The person keeps their Productivity Dashboard, keeps
-- their Goals row (/goals/weekly/team renders the same board component and is
-- deliberately left alone), keeps every task and goal they own. One list, one
-- flag.
--
-- `performance_archived_at` is the WHEN — what the Archive sorts by and what
-- makes "put away in March" answerable — matching the pair every other
-- archivable table in this app carries (tasks, dcc_kpi_items, tc_materials,
-- and billing_documents / pms_monthly_review in 0231).
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived boolean NOT NULL DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived_at timestamptz;

-- PARTIAL, like 0230's and 0231's: almost every employee is on the board, so
-- an index over the whole column would be one enormous all-false entry. This
-- indexes only the filed rows, which is the set the Archive reads.
CREATE INDEX IF NOT EXISTS employees_performance_archived_idx
  ON employees (performance_archived)
  WHERE performance_archived = true;


-- ============================================================================
-- THE LEDGER — record what was applied, so scripts/apply-all-migrations.ts and
-- `pnpm db:migrate:dry` stop reporting these as pending.
-- ============================================================================

INSERT INTO __schema_applied (filename) VALUES
  ('0215_goal_archive.sql'),
  ('0225_doer_initiator_status.sql'),
  ('0229_billing_documents.sql'),
  ('0230_daily_checklist_initiator_status.sql'),
  ('0231_billing_pms_archive.sql'),
  ('0232_team_performance_archive.sql')
ON CONFLICT DO NOTHING;
