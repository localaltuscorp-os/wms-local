# PROMPT — Build the **Billing / Invoice** module (Quotation → Proforma → Tax Invoice)

> Paste everything below the line into a fresh Claude Code session in this repo.
> Attach the 4 reference images in the same message (3 handwritten requirement
> sheets + 1 sample Tax Invoice). **Images 1–3 are the requirements. Image 4 is a
> visual reference only — do not copy its literal values.**

---

Build a complete **Billing / Invoice module**: one document engine that issues
**Quotations, Proforma Invoices and Tax Invoices**, converts a document forward
along `Quotation → Proforma Invoice → Tax Invoice` (and `Proforma → Tax Invoice`)
without ever destroying the source, numbers every document automatically per
issuing entity / document type / financial year, computes GST (CGST+SGST / IGST /
none), and produces a print-ready PDF that can be downloaded, printed, emailed or
sent on WhatsApp — with a status trail behind all of it.

This repo already has a Billing workspace, a paying-entity registry, a product
master, an Admin Panel with master-list screens, a pdfkit house style (including
`amountInWords`), Resend email and a WhatsApp Cloud API client. **Reuse them.**
Section 3 is the map — verify each path before you rely on it, then work from it
instead of re-deriving it.

Ask me only if something genuinely cannot be inferred. Otherwise make the call,
and state the assumption in your first message before you write code.

---

## 1. The four images

| Image | What it is | How to use it |
|---|---|---|
| 1, 2, 3 | Handwritten requirements | The actual spec. Every field named there must exist. |
| 4 | A sample Tax Invoice built from those notes | Layout reference for the PDF **only**. |

Nothing legible in the images may be hard-coded. Specifically **not**: entity or
customer names (Unleashed, The Perfect Blend, Legacy Creators, Gainmakers, New
Corp, Powerz Kheam, Dattaram Kap, Smita Raut, Sunil Raut), document numbers
(`90001-26-27`, `90002`), product codes (`P90`, `B350`, `PS`, `B35`, `RED`,
`COM`), the service description ("Fees for Technical Services"), payment terms
("DP", "Immediate"), any GST amount (₹75,000 / ₹6,750 / ₹88,500), any PAN, GSTIN,
SAC code, bank account or email address. Every one of those is a database value,
a lookup row, or a computation.

If a required detail is unreadable in the images, ask me — do not invent a value
and do not silently drop the field.

---

## 2. Vocabulary

- **Document** — one row in the billing ledger. Exactly one of three **types**:
  `quotation`, `proforma_invoice`, `tax_invoice`. All three share one table, one
  form and one PDF renderer; the type changes the title, the number series and
  the edit rules, nothing else.
- **Issuing entity (seller)** — *which of our companies is billing*. Drives the
  logo, letterhead, PAN, GSTIN, bank details, signatory and number series. Comes
  from the existing paying-entity registry, not free text.
- **Customer (bill-to)** — who is being billed. Name, email, WhatsApp, PAN,
  GSTIN, address, place of supply. May have **no GSTIN** — that is a first-class
  case, not an error.
- **Snapshot** — the customer + seller fields **copied onto the document** at
  save time. A printed invoice must never change because someone later edited a
  master row. This is the single most important data rule in the module.
- **Conversion** — creating a *new* document of a later type from an existing
  one, copying everything, linking back via `source_document_id`, and marking the
  source `converted`. The source is never deleted, never edited, never renumbered.
- **Series** — the `(issuing entity, document type, financial year)` counter that
  produces the next document number. Gapless and atomic.
- **Financial year** — India, **1 April → 31 March**. `2026-04-01` … `2027-03-31`
  is FY `26-27`, and `26-27` is exactly the suffix in the handwritten
  `90001-26-27`.
- **GST mode** — `cgst_sgst` (intra-state), `igst` (inter-state), `none`
  (customer/service outside GST), `exempt` (zero-rated but GST-registered).

---

## 3. What already exists in this repo — verify, then reuse

Do **not** create a second entity master, a second product master, a second PDF
style or a second email sender.

### 3.1 Workspace, routes, nav, permissions
- `app/(app)/billing/page.tsx` — the Billing landing page **already exists**. It
  renders the Google-Sheets-backed revenue ledger (`getBillingDashboard` from
  `lib/queries/billing.ts`, mappers in `lib/billing/sheet.ts`). **Do not touch
  either file and do not change that page's behaviour** — the new document
  surfaces are siblings under `/billing/*`.
- `lib/workspaces.ts` — `billing` is already a registered workspace (label
  "Billing", landing `/billing`, route→workspace mapping on `/billing`).
- `components/layout/main-nav.tsx` (~line 446) — the `billing` rail, one entry
  today. Add the new surfaces here.
- `lib/permissions/catalog.ts` (~line 402) — node `billing` with child
  `billing.ledger` → `/billing`. Add the new nodes here.
  `tests/unit/permission-catalog.test.ts` asserts every declared route resolves
  to a real page file and that no route is claimed twice — so add nodes and pages
  together or the suite goes red.
- Guards: `requireUser` / `requireAdmin` (`lib/auth/current.ts`),
  `requireWorkspace` / `requireWorkspaceAdmin` (`lib/auth/workspace-access.ts`).

### 3.2 Issuing entities (seller side) — the "Entity / Admin Panel" of the notes
- `lib/hr/entities.ts` — the canonical registry: `EntityId`, `getEntity()`,
  `displayName`, `legalName`, per-entity `logo` (`public/logos/<id>.jpg`),
  `contactLine`, `addressLine`, plus `DEFAULT_PHONE` / `DEFAULT_EMAIL` /
  `DEFAULT_WEBSITE` / `DEFAULT_ADDRESS_LINE`. Pure and client-safe.
- `db/schema.ts` → `payingEntities` (`paying_entities`, name-only lookup) and the
  Admin screen `app/(admin)/admin/paying-entities/`.
- `lib/hr/firm.ts` — firm-name tokens, `HR_CONTACT`, signature image constants
  (`HR_SIGNATURE_IMAGE`, the Director signature). Read it before you invent a
  signature convention: signature assets live under `public/signatures/`.
- `db/schema.ts` → `orgSettings` (`org_settings`, singleton id=1) already carries
  `companyName` and **`logoUrl`**, edited from `app/(admin)/admin/settings/`.
  That is the "Add Logo" hook — extend it, do not build a parallel one.

**What is missing and you must add:** the *billing* attributes of an issuing
entity — PAN, GSTIN, state / state code, bank name, account number, IFSC, branch,
UPI, default SAC, signatory name + designation + signature asset, number-series
prefix, default payment terms, the interest/late-fee clause.

### 3.3 Customers and products (bill-to side)
- `outstanding_products` (`db/schema.ts`) — the real product master: `name`,
  nullable short `code` ("BSS", "GP"), `isActive`, `sortOrder`. Rendered through
  `lib/products/label.ts` → `productLabel()` ("GP · Graduate Programs"). Admin
  screen: `app/(admin)/admin/outstanding-products/`.
- `outstanding_entities` (`outstandingEntitiesTbl`) and `clients` — name-only
  customer lookups, each with an Admin screen.
- `product_options` — a free-text MCQ option list for forms. **Not** the product
  master; don't bill from it.
- `lib/outstanding/*` — the closest existing "money document" module
  (`outstanding_contracts` / `_installments` / `_collections` / `_attachments`).
  Read `app/(app)/outstanding/actions.ts` for the house action style and
  `lib/validators/outstanding.ts` for the validator style.

**What is missing:** customers have no email / WhatsApp / PAN / GSTIN / address
anywhere. That is the gap section 5.2 fills.

### 3.4 PDF — already solved, do not start over
`lib/salary/pdf-house-style.ts` (pdfkit, `server-only`) exports exactly what an
invoice needs: `COLORS`, `newDoc()`, `drawChrome()`, `drawMasthead()`,
`drawTitleBand()`, `drawSectionHeading()`, `drawStatTiles()`,
`drawSignatoryBlock()`, `drawFooter()`, `inr()`, `fmtDate()`,
`entityLogoPath()`, `SIG_DIR`, and **`amountInWords()`** — a correct
Indian-system converter that already returns `"Rupees Eighty Eight Thousand Five
Hundred Only"`. The "amount in words" requirement is a one-line import; writing a
second converter is a bug, not a feature.

Streaming pattern to copy: `app/(app)/salary/payslip/[runId]/route.ts`. Other
live examples: `app/(app)/outstanding/export.pdf/route.ts`,
`app/(app)/agreements/pdf/[id]/route.ts`, `app/api/hr/letters/pdf/`.
Deps present: `pdfkit`, `pdf-lib`, `puppeteer-core`.

### 3.5 Email / WhatsApp / storage
- `lib/email/resend.ts` — `getResend()`, `FROM`, `companyBcc()`,
  `clampSubject()`, `errorMessage()`, `sendPlainEmail()`. React Email templates
  live in `emails/` (`_layout.tsx`, `_components.tsx`).
- `lib/email/hr-letter-email.ts` → `sendLetterPdfEmail()` — **the pattern for
  "email a generated PDF"**. Copy its shape.
- `lib/whatsapp/media.ts` → `uploadMedia()`, `sendDocument()`,
  `sendDocumentTemplate()`; `lib/whatsapp/client.ts` → `sendTemplate()`;
  `lib/whatsapp/dispatch.ts` → `sendWhatsApp()`; `lib/validators/whatsapp.ts`.
- `lib/supabase/admin.ts` → `getSupabaseAdmin()`, `DOCUMENTS_BUCKET` — how
  generated files are persisted (see the reimbursement-attachment comments in
  `db/schema.ts`).

### 3.6 Platform conventions
- Next.js 15 App Router, TypeScript, Drizzle + Postgres, server actions,
  Tailwind v4 with design tokens (`--color-hairline`, `text-ink-strong`,
  `text-ink-muted`, `rounded-pill`, `wg-rise`), `PageShell`, lucide icons.
- Actions: `"use server"` → `requireWorkspace(...)` → `rateLimitOrError(...)`
  (`lib/rate-limit.ts`) → zod parse → DB → `revalidatePath(...)`, returning
  `{ ok: true, ... } | { ok: false, error }` and **never throwing to the UI**.
- Money: `numeric(14,2)`. Dates: `date` columns + ISO `YYYY-MM-DD` strings.
- Latest migration on disk is `db/migrations/0225_doer_initiator_status.sql`, so
  yours is **`0226_billing_documents.sql`**. Check `db/migrations/` again first —
  numbers may have moved — and remember this checkout talks to the live Supabase,
  so migrations are applied by hand; `db:migrate:dry` cannot be trusted.
- `DUMMY_MODE=true` runs the app on in-process PGlite with a seeded admin
  (`lib/db/index.ts`). **Every screen you build must work under `pnpm dev:dummy`**
  — no Supabase, no Google Sheets, no Firebase. PDF generation must not require
  object storage; persisting the PDF is optional and must degrade quietly.

---

## 4. Assumptions — state these back to me, then build on them

1. **"Entity" in the notes means the *issuing* company.** "Entity: Admin Panel /
   Add Logo", "PAN Details: Admin Panel", "Signature Details: Admin Panel",
   "Bank Details", "Address: Admin Panel" are all seller-side, configured once
   per entity in the Admin Panel. Names in the notes that are clearly people
   (Dattaram Kap, Smita Raut, Sunil Raut) are **customers**. So the module needs
   both sides, and the create form has both an **Issued by (entity)** picker and
   a **Bill to (customer)** picker.
2. `90001-26-27` = `<sequence>-<financial year>`. Quotations start at a
   configurable base (90001 by default, so `90002` is simply the next one);
   Proforma and Tax Invoice each get their **own** series with their own
   configurable prefix/base. Nothing about the number is hard-coded.
3. **GST is derived, never typed.** The user picks whether GST applies and the
   rate; intra-state vs inter-state is computed from seller state vs place of
   supply. CGST/SGST/IGST amounts are outputs.
4. A **Tax Invoice becomes immutable once `generated`** — GST documents are not
   silently editable. Corrections happen by `cancelled` + reissue. Quotations and
   Proformas stay editable until converted. Tell me if you want tax invoices
   editable; I'll take the trade-off, but the default is immutable.
5. `pending` is **derived**, not stored: a `generated`/`sent` tax invoice past its
   due date shows as *Pending/Overdue* in the list. Stored statuses are `draft`,
   `generated`, `sent`, `converted`, `cancelled`, `paid`.
6. A document converts **forward only once** — a Quotation yields one Proforma.
   Enforced by a partial unique index; a cancelled child frees the source again.
7. Line-level GST. Tax is computed per line, then summed, then the grand total is
   rounded to the nearest rupee into an explicit `round_off` field. Never
   back-compute tax from the total.
8. The customer master is **new but linkable**: `billing_customers` carries an
   optional FK to `clients` / `outstanding_entities` so the same real customer is
   one row across modules, and a backfill seeds it from those existing names. No
   duplicate master.

---

## 5. Data model — migration `0226_billing_documents.sql` + Drizzle in `db/schema.ts`

Keep the columns and the constraints; rename only to match repo conventions.
Every table gets `created_at` / `updated_at` `timestamptz NOT NULL DEFAULT now()`
and `created_by_id` / `updated_by_id` → `employees(id) ON DELETE SET NULL`, as the
rest of the schema does.

### 5.1 Seller billing profile — one row per issuing entity

```sql
CREATE TABLE billing_entity_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Canonical EntityId from lib/hr/entities.ts ("altus-corp", "unleashed", …).
  -- Text, not an FK, because the registry is code; UNIQUE so one profile each.
  entity_id          text NOT NULL UNIQUE,
  paying_entity_id   uuid REFERENCES paying_entities(id) ON DELETE SET NULL,
  legal_name         text,            -- overrides the registry when set
  pan                text,
  gstin              text,
  state_name         text,            -- the SELLER's state
  state_code         text,            -- 2-digit GST state code
  address_line       text,
  email              text,
  whatsapp           text,
  phone              text,
  website            text,
  logo_url           text,            -- overrides public/logos/<entity_id>.jpg
  bank_name          text,
  bank_account_name  text,
  bank_account_no    text,
  bank_ifsc          text,
  bank_branch        text,
  upi_id             text,
  default_sac_code   text,
  signatory_name     text,
  signatory_designation text,
  signature_image_url text,           -- else fall back to public/signatures/*
  default_payment_terms_id uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  interest_clause    text,            -- the "interest @ x% after due date" line
  invoice_footer_note text,
  is_active          boolean NOT NULL DEFAULT true
);
```

### 5.2 Customer master

```sql
CREATE TABLE billing_customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,
  email         text,
  whatsapp      text,          -- E.164, "+919876543210"
  phone         text,
  pan           text,
  gstin         text,          -- NULL = non-GST customer, a valid state
  address_line1 text,
  address_line2 text,
  city          text,
  state_name    text,
  state_code    text,          -- drives intra vs inter-state GST
  pincode       text,
  country       text NOT NULL DEFAULT 'India',
  -- No duplicate masters: link the same real customer across modules.
  client_id             uuid REFERENCES clients(id) ON DELETE SET NULL,
  outstanding_entity_id uuid REFERENCES outstanding_entities(id) ON DELETE SET NULL,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX billing_customers_name_uq ON billing_customers (lower(name));
CREATE INDEX billing_customers_active_idx ON billing_customers (is_active, name);
```

### 5.3 Lookups (admin-managed, soft-deleted so history stays joinable)

```sql
CREATE TABLE billing_payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,            -- "Immediate", "30 Days", "DP", …
  due_days    integer,                  -- NULL = no computable due date (e.g. DP)
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100
);
CREATE UNIQUE INDEX billing_payment_terms_label_uq ON billing_payment_terms (lower(label));

CREATE TABLE billing_sac_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  description text NOT NULL,
  default_gst_rate numeric(5,2),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100
);
CREATE UNIQUE INDEX billing_sac_codes_code_uq ON billing_sac_codes (code);
```

Seed `billing_payment_terms` in the migration with **Immediate, 7 Days, 15 Days,
30 Days, 45 Days, DP, Advance** (all editable, all deactivatable). "Custom" is not
a row — it is a free-text override on the document.

### 5.4 Product master — extend, never fork

```sql
ALTER TABLE outstanding_products
  ADD COLUMN sac_code         text,
  ADD COLUMN default_rate     numeric(14,2),
  ADD COLUMN default_gst_rate numeric(5,2),
  ADD COLUMN description      text,
  ADD COLUMN is_billable      boolean NOT NULL DEFAULT true;
```

Additive and nullable, so Outstanding keeps working untouched. Surface the new
fields in `app/(admin)/admin/outstanding-products/`.

### 5.5 Number series

```sql
CREATE TABLE billing_number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     text NOT NULL,
  doc_type      text NOT NULL,          -- quotation | proforma_invoice | tax_invoice
  fin_year      text NOT NULL,          -- "26-27"
  prefix        text NOT NULL DEFAULT '',
  next_seq      integer NOT NULL,       -- seeded from the series base
  pad_width     integer NOT NULL DEFAULT 0,
  UNIQUE (entity_id, doc_type, fin_year)
);
```

### 5.6 Documents

```sql
CREATE TABLE billing_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type      text NOT NULL,      -- quotation | proforma_invoice | tax_invoice
  doc_no        text NOT NULL,      -- "90001-26-27" — assigned, never typed
  fin_year      text NOT NULL,
  seq           integer NOT NULL,
  doc_date      date NOT NULL,
  due_date      date,
  status        text NOT NULL DEFAULT 'draft',

  -- seller
  entity_id             text NOT NULL,
  entity_profile_id     uuid REFERENCES billing_entity_profiles(id) ON DELETE SET NULL,
  -- SNAPSHOT (see §2). Printed values live here, not behind a join.
  seller_snapshot       jsonb NOT NULL,   -- name, legal, pan, gstin, state, address,
                                          -- email, whatsapp, bank{...}, signatory{...},
                                          -- logo_url, interest_clause, footer_note

  -- customer
  customer_id           uuid REFERENCES billing_customers(id) ON DELETE SET NULL,
  customer_snapshot     jsonb NOT NULL,   -- name, email, whatsapp, pan, gstin, address, state
  -- Editable-on-the-document contact copies, so "send to" is visible and
  -- overridable in the list and on the form without digging into the jsonb.
  customer_name         text NOT NULL,
  customer_email        text,
  customer_whatsapp     text,
  customer_gstin        text,
  place_of_supply_state text,
  place_of_supply_code  text,

  -- service / terms
  service_description   text,              -- free text OR picked from a SAC row
  payment_terms_id      uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  payment_terms_label   text,              -- snapshot, incl. a "Custom" override
  remarks               text,

  -- tax + totals (all computed, all stored for audit)
  gst_mode      text NOT NULL DEFAULT 'cgst_sgst',  -- cgst_sgst | igst | none | exempt
  is_reverse_charge boolean NOT NULL DEFAULT false,
  subtotal      numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  taxable_value numeric(14,2) NOT NULL DEFAULT 0,
  cgst_amount   numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount   numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount   numeric(14,2) NOT NULL DEFAULT 0,
  round_off     numeric(14,2) NOT NULL DEFAULT 0,
  total         numeric(14,2) NOT NULL DEFAULT 0,
  amount_in_words text,
  currency      text NOT NULL DEFAULT 'INR',

  -- lineage
  source_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  source_doc_no      text,
  source_doc_type    text,

  -- lifecycle
  generated_at  timestamptz,
  sent_at       timestamptz,
  paid_at       timestamptz,
  paid_amount   numeric(14,2),
  cancelled_at  timestamptz,
  cancel_reason text,
  pdf_storage_path text,            -- Supabase documents bucket; NULL is fine
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX billing_documents_no_uq
  ON billing_documents (entity_id, doc_type, fin_year, doc_no);
CREATE INDEX billing_documents_list_idx ON billing_documents (doc_type, status, doc_date DESC);
CREATE INDEX billing_documents_customer_idx ON billing_documents (customer_id, doc_date DESC);
CREATE INDEX billing_documents_source_idx ON billing_documents (source_document_id);
-- Assumption 6: forward-convert once. A cancelled child frees the source.
CREATE UNIQUE INDEX billing_documents_one_child_uq
  ON billing_documents (source_document_id)
  WHERE source_document_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE billing_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES outstanding_products(id) ON DELETE SET NULL,
  code         text,                       -- snapshot of the product code
  name         text NOT NULL,              -- snapshot of the product/service name
  description  text,
  sac_code     text,
  hsn_code     text,
  quantity     numeric(12,3) NOT NULL DEFAULT 1,
  unit         text,
  rate         numeric(14,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount       numeric(14,2) NOT NULL DEFAULT 0,   -- qty*rate − discount
  gst_rate     numeric(5,2) NOT NULL DEFAULT 0,
  cgst_amount  numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount  numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount  numeric(14,2) NOT NULL DEFAULT 0,
  line_total   numeric(14,2) NOT NULL DEFAULT 0,
  sort_order   integer NOT NULL DEFAULT 0
);
CREATE INDEX billing_document_lines_doc_idx ON billing_document_lines (document_id, sort_order);

-- Append-only trail. Mirrors employee_events / task_events.
CREATE TABLE billing_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  event_type  text NOT NULL,   -- created | updated | generated | emailed | whatsapped
                               -- | printed | converted | cancelled | paid | pdf_generated
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_document_events_doc_idx ON billing_document_events (document_id, created_at DESC);
```

The enums (`quotation | proforma_invoice | tax_invoice`, the statuses, the GST
modes) go in `db/enums.ts` as `as const` arrays with derived types, matching that
file's style.

---

## 6. Numbering — `lib/billing/numbering.ts`

Pure helpers plus one server-side allocator.

- `financialYear(iso: string): string` → `"26-27"` for any date in 1 Apr 2026 –
  31 Mar 2027. Unit-test the boundaries: `2026-03-31` → `25-26`,
  `2026-04-01` → `26-27`.
- `formatDocNo({ prefix, seq, padWidth, finYear })` → `"90001-26-27"`.
- `allocateDocNo({ entityId, docType, docDate })` — **one atomic statement**, in
  the same transaction as the document insert:

```sql
INSERT INTO billing_number_series (entity_id, doc_type, fin_year, prefix, next_seq, pad_width)
VALUES ($1, $2, $3, $4, $5 + 1, $6)
ON CONFLICT (entity_id, doc_type, fin_year)
DO UPDATE SET next_seq = billing_number_series.next_seq + 1
RETURNING next_seq - 1 AS seq, prefix, pad_width;
```

Rules:

- A number is allocated **when the document is generated, not when the draft is
  created**. Drafts show "Draft — number on generate". Otherwise an abandoned
  draft burns an invoice number, and a gap in a tax-invoice series is an audit
  finding.
- The series base and prefix are admin-configurable per `(entity, docType)`. Seed
  quotations at 90001 in the migration *as a default row value*, so the observed
  `90001-26-27` / `90002` reproduce without the constant living in code.
- A new financial year auto-creates its series row on first use, restarting the
  sequence.
- Never renumber on edit. Never reuse a cancelled number.
- Concurrency test: allocate 50 numbers in parallel, assert 50 distinct
  contiguous values.

---

## 7. GST engine — `lib/billing/tax.ts` (pure, client-safe, unit-tested)

```ts
export type GstMode = "cgst_sgst" | "igst" | "none" | "exempt";

export function resolveGstMode(args: {
  sellerGstin: string | null;
  sellerStateCode: string | null;
  customerStateCode: string | null;
  gstApplicable: boolean;
}): GstMode;

export function computeTotals(lines: LineInput[], mode: GstMode): Totals;
```

- Seller not GST-registered, or the user switched GST off → `none`: all three tax
  amounts are 0, the PDF **omits the CGST/SGST/IGST rows entirely** (it does not
  print "0.00"), and prints the configured "GST not applicable" note.
- Same state code on both sides → `cgst_sgst`, each at `gst_rate / 2`.
- Different state codes (or an unknown customer state) → `igst` at the full rate.
- `exempt` → zero amounts, but the tax rows are shown at 0% with the exemption
  note.
- Per line: `amount = round2(qty × rate) − discount`;
  `tax = round2(amount × rate%)`. Sum the lines, then
  `round_off = round(total) − total`, `total = round(total)`.
- `amountInWords` from `lib/salary/pdf-house-style.ts` for the final payable.
- The **same** functions run on the client (live totals in the form) and on the
  server (authoritative recompute on save). The server **never trusts** posted
  totals — it recomputes from lines and mode and writes its own numbers.
- Tests must cover the handwritten example's shape: base 75,000 at 18%
  intra-state → CGST 6,750 + SGST 6,750 → 88,500; the same base inter-state →
  IGST 13,500; and a zero-GST document.

---

## 8. Status & conversion

```
draft ──generate──> generated ──send──> sent
  │                    │                 │
  │                    ├──convert────────┤──> converted   (source is frozen)
  │                    ├──mark paid──────┤──> paid
  └──cancel──> cancelled <───cancel──────┘
```

- `pending` / `overdue` is **derived** in the list: status ∈ {generated, sent} and
  `due_date < today`.
- **Cancel never deletes.** It sets `status='cancelled'` + `cancelled_at` +
  `cancel_reason`, writes an event, and keeps the number retired.
- **Convert** (`convertBillingDocument({ sourceId, toType })`), in one transaction:
  1. Load the source with its lines; reject if cancelled, if it already has a
     live child, or if the hop is not `quotation→proforma_invoice`,
     `quotation→tax_invoice` or `proforma_invoice→tax_invoice`.
  2. Insert the new document copying **everything** — customer, snapshots, lines,
     service description, GST mode and rate, payment terms, remarks — with
     `doc_type = toType`, `doc_date = today`, a freshly allocated number from the
     target series, `source_document_id` / `source_doc_no` / `source_doc_type`
     set, and `status='draft'` so the user can adjust before generating.
  3. Set the source to `converted`. **Do not delete it, do not edit it.**
  4. Write `converted` events on both rows.
- Both documents show the lineage: the child prints "Ref: Quotation No.
  90001-26-27 dt 01 Apr 2026" on the PDF and links to the parent in the UI; the
  parent shows "Converted to Tax Invoice 10004-26-27".

---

## 9. Screens

All under the existing `billing` workspace. `export const dynamic = "force-dynamic"`,
`PageShell`, the purple accent already used by `app/(app)/billing/page.tsx`
(`#9333ea` / `#7e22ce`), responsive down to a phone.

### 9.1 `/billing/documents` — the ledger list

Server-loads one page of rows via `lib/queries/billing-documents.ts` (never N+1).

Columns: **Document No** (type chip: Quotation grey · Proforma amber · Tax
Invoice purple) · **Customer** · **Date** · **Due** · **Taxable** · **GST** ·
**Total** · **Status** badge · **Created by** · row actions.

Filters, all URL state so a filtered view is shareable: type, status, customer,
issuing entity, financial year, date range, plus a search box matching document
number / customer / remarks. Summary tiles above: count and value by type,
outstanding (generated + sent, unpaid), overdue.

Row actions by status: **View · Edit** (draft only, and never a generated tax
invoice) · **Generate** · **Download PDF · Print · Email · WhatsApp · Convert →
· Mark paid · Cancel**. Empty state offers "New document".

### 9.2 `/billing/documents/new` and `/billing/documents/[id]/edit` — the form

One client component, sectioned exactly as the requirement lists:

1. **Basic** — Invoice type (segmented: Quotation / Proforma / Tax Invoice) ·
   Issued by (entity) · Document number (read-only, "assigned on generate") ·
   Document date · Reference document (searchable picker of eligible source
   documents — selecting one loads everything, see §9.5).
2. **Customer** — customer combobox, creatable inline ("＋ Add …" opens a small
   dialog writing `billing_customers`, so billing is never blocked on the Admin
   Panel). Selecting one auto-fills name, email, WhatsApp, PAN, GSTIN, address and
   place of supply — each **editable on the document** without mutating the
   master. Show an explicit "Non-GST customer" note when GSTIN is empty.
3. **Service** — Service description (free text, with a datalist of previously
   used descriptions and the SAC catalogue; never pre-filled with a literal).
4. **Products / Services** — a repeatable line editor: product combobox (from
   `outstanding_products`, labelled with `productLabel()`, pre-filling code,
   description, SAC, rate, GST rate — all overridable) · description · SAC · qty ·
   unit · rate · discount · GST % · computed amount. Add / remove / reorder rows.
   A line with no product is allowed — a one-off service is typed.
5. **Tax** — "GST applicable" toggle · GST rate · derived mode badge
   ("Intra-state — CGST 9% + SGST 9%" / "Inter-state — IGST 18%" / "No GST") ·
   reverse-charge checkbox. A live totals panel (sticky on desktop) shows taxable
   value, each tax, round-off, total, and the amount in words.
6. **Payment** — Payment terms (dropdown from `billing_payment_terms`, plus a
   Custom text option) · Due date (auto = doc date + `due_days`, editable).
7. **Additional** — Remarks (multiline textarea).
8. **Company details** — a read-only card rendering the resolved seller profile
   (logo, PAN, GSTIN, bank, signatory, address, email, WhatsApp) with an "Edit in
   Admin Panel" link. Never hand-typed. If the chosen entity has no billing
   profile yet, show an inline warning with that link and block **Generate** (a
   Tax Invoice without a GSTIN is not a Tax Invoice) while still allowing **Save
   draft**.

Buttons: **Save draft** · **Save & Generate** · **Preview** · Cancel. Validation
is inline and per-field; the submit error names the first offending field.

### 9.3 `/billing/documents/[id]` — detail

The document rendered on screen exactly as the PDF reads (one shared layout
component so preview and print cannot drift), plus the status timeline from
`billing_document_events`, the lineage links, and the full action bar (Download,
Print, Email, WhatsApp, Convert, Mark paid, Cancel, Edit where allowed).
`window.print()` with a `@media print` stylesheet that drops nav and chrome.

### 9.4 `/billing/documents/[id]/pdf` — route handler

Streams `application/pdf` with a filename like
`Tax-Invoice-10004-26-27-Acme.pdf`. Copy
`app/(app)/salary/payslip/[runId]/route.ts`. `?download=1` forces `attachment`;
default is `inline`.

### 9.5 Reference document

On the create form, "Reference document" lists eligible sources for the selected
type (Tax Invoice → live Quotations + Proformas; Proforma → live Quotations),
searchable by number or customer, excluding cancelled and already-converted rows.
Picking one loads the whole payload into the form and pins a lineage banner
("Converting Quotation 90001-26-27"). Submitting runs the §8 conversion path — so
"Convert" from the list and "reference document" on the form are **one**
server-side code path, not two.

---

## 10. Server actions — `app/(app)/billing/documents/actions.ts`

Every one: `"use server"` → `requireWorkspace("billing")` (admin-only ones use
`requireWorkspaceAdmin`) → `rateLimitOrError(actor.id, "write")` → zod parse from
`lib/validators/billing.ts` → recompute totals server-side → transaction →
`revalidatePath` → return `{ok:true,…} | {ok:false,error}`. Never throw to the UI.
Write a `billing_document_events` row for every state change.

| action | purpose |
|---|---|
| `saveBillingDraft(input)` | create/update a draft; no number allocated |
| `generateBillingDocument({ id })` | validate completeness, allocate the number, snapshot seller + customer, recompute totals, set `generated`, stamp `generated_at` |
| `updateBillingDocument(input)` | edit; refuses a generated tax invoice (§4.4) and any converted/cancelled row |
| `convertBillingDocument({ sourceId, toType })` | §8 |
| `cancelBillingDocument({ id, reason })` | soft-cancel; reason required |
| `markBillingDocumentPaid({ id, paidAmount, paidAt })` | status `paid` |
| `emailBillingDocument({ id, to, cc, subject, message })` | render PDF → send via Resend → `sent`, `sent_at`, event |
| `whatsappBillingDocument({ id, to })` | render PDF → `uploadMedia` + `sendDocument` → event; returns a `wa.me` fallback link when the API is unconfigured |
| `createBillingCustomer` / `updateBillingCustomer` | inline + Admin Panel |
| `upsertBillingEntityProfile` | Admin Panel (admin only) |
| `createBillingPaymentTerm` / `updateBillingPaymentTerm` | Admin lookup |
| `createBillingSacCode` / `updateBillingSacCode` | Admin lookup |
| `setBillingNumberSeries` | Admin: prefix / base / padding per (entity, type) |

Read helpers in `lib/queries/billing-documents.ts` (**new file** — leave
`lib/queries/billing.ts`, the Sheets ledger, alone): `listBillingDocuments(filters)`,
`getBillingDocument(id)` (with lines, events, lineage), `listBillingCustomers()`,
`listBillableProducts()`, `listPaymentTerms()`, `listSacCodes()`,
`getEntityBillingProfile(entityId)`, `listConvertibleSources(toType)`,
`billingSummary(filters)`. Batch by id list; no per-row queries.

Put the document-building core (`buildDocumentPayload`, `writeDocument`) in
`lib/billing/documents.ts`, taking an explicit `{ id, email }` actor, so a future
mobile/JSON API shares one implementation — the pattern `lib/dcc` already uses.

---

## 11. The PDF — `lib/billing/invoice-pdf.ts`

`server-only`, pdfkit, built on `lib/salary/pdf-house-style.ts`. Image 4 is the
layout reference: clean, A4, single page for a normal document, lines paginating
with the header repeated.

Top to bottom:

1. **Masthead** — entity logo (profile `logo_url` → `entityLogoPath(entityId)` →
   `org_settings.logoUrl`, each read guarded so a missing file never breaks the
   PDF), legal name, address, phone, email, website, **PAN**, **GSTIN**.
2. **Title band** — `TAX INVOICE` / `PROFORMA INVOICE` / `QUOTATION`,
   unmistakable. A non-tax document prints the rider "This is not a tax invoice".
3. **Meta block** — document no, date, due date, payment terms, place of supply,
   and `Ref: <source type> <source no> dt <date>` when converted.
4. **Bill to** — customer name, address, PAN, GSTIN (or "Unregistered"), email,
   WhatsApp.
5. **Service description** — the document's own text.
6. **Line table** — #, Description (name + description + code), SAC, Qty, Rate,
   Amount; right-aligned tabular figures.
7. **Totals ladder** — Taxable value, then only the applicable taxes
   (`CGST @ 9%` / `SGST @ 9%` / `IGST @ 18%`, the rate label derived), Round off,
   **Total Amount Payable** emphasised.
8. **Amount in words** — `amountInWords(total)`.
9. **Bank details** — name, account name, account no, IFSC, branch, UPI; omit a
   blank line rather than printing an empty label.
10. **Remarks + interest clause** from the document and the entity profile.
11. **Signature block** — `drawSignatoryBlock()`: "For <Legal Name>", the
    signature image when configured, signatory name and designation, "Authorised
    Signatory".
12. **Footer** — `drawFooter()`, the contact line, and a generated-by/timestamp
    line.

Rules: never print a hard-coded name, PAN, GSTIN, bank, SAC, term or amount —
every value comes from the row or its snapshot. Never print an empty labelled
field. Every asset read is guarded. The on-screen detail view and the PDF are fed
by the **same** `buildInvoiceViewModel(document)` so they cannot diverge.

---

## 12. Email & WhatsApp

**Email** — `lib/email/billing-document-email.ts`, shaped like
`lib/email/hr-letter-email.ts`: a React Email template in `emails/` using
`_layout.tsx` / `_components.tsx`, a `clampSubject()`-ed subject ("Tax Invoice
10004-26-27 — Altus Corp"), the PDF attached, `companyBcc()` applied, and a body
summarising number, date, total and payment terms. The send dialog pre-fills the
customer's email, allows editing it and adding CC, and offers a custom message
box. `getResend()` returning null (no key configured) must surface as a clean
"Email is not configured" error, never a crash.

**WhatsApp** — the dialog pre-fills `customer_whatsapp`, validates E.164, and
sends the PDF through `uploadMedia()` + `sendDocument()`. When the Cloud API is
not configured, fall back to a `wa.me/<number>?text=…` link carrying the document
summary and a link to the detail page — the user then attaches the downloaded PDF
manually. Either way, write the event and set `sent` / `sent_at`.

Both surface success and failure through the app's existing toast (`lib/toast.ts`).

---

## 13. Admin Panel (`app/(admin)/admin/*`)

Follow `app/(admin)/admin/outstanding-products/page.tsx` exactly: `requireAdmin()`,
a query from `lib/queries/*`, `AdminSection` from
`components/admin/ui/section-shell`, and a roster list component with
create/update actions.

New sections:

- **`/admin/billing-profiles`** — one editable card per entity from
  `lib/hr/entities.ts`: PAN, GSTIN, state + code, address, email, WhatsApp, phone,
  website, **logo upload**, bank block, UPI, default SAC, signatory name +
  designation + **signature upload**, default payment terms, interest clause,
  footer note, and the number-series prefix/base/padding per document type. This
  screen is the answer to every "…: Admin Panel" in the handwritten notes.
- **`/admin/billing-customers`** — the customer master with all of §5.2, plus the
  optional links to `clients` / `outstanding_entities`.
- **`/admin/billing-payment-terms`** — label, due days, default, active.
- **`/admin/billing-sac-codes`** — code, description, default GST rate.
- Extend **`/admin/outstanding-products`** with SAC, default rate, default GST
  rate, description, billable.
- Extend **`/admin/settings`** with the company logo upload if it is not already
  wired (`org_settings.logoUrl` exists; check
  `app/(admin)/admin/settings/actions.ts`).

Uploads go to the Supabase `documents` bucket via `lib/supabase/admin.ts`, the way
reimbursement attachments do; under `DUMMY_MODE` accept a URL/path instead and
degrade quietly.

---

## 14. Wiring — do not forget these four

1. **`lib/permissions/catalog.ts`** — extend the `billing` node:
   `billing.documents` → `["/billing/documents"]`, `billing.documents.new` →
   `["/billing/documents/new"]`, `billing.documents.detail` →
   `["/billing/documents/[id]"]`, keeping `billing.ledger` as it is. Then run
   `tests/unit/permission-catalog.test.ts`.
2. **`components/layout/main-nav.tsx`** (~line 446) — add rail entries
   "Documents" and "New Document" to the `billing` workspace, `exact: false`,
   keeping the existing Billing entry first.
3. **`lib/workspaces.ts`** — `/billing/*` already maps to the `billing`
   workspace; confirm the new paths resolve and that the landing page is
   unchanged.
4. **Admin nav** — register the new admin sections wherever
   `app/(admin)/admin/page.tsx` lists them.

---

## 15. Validation — `lib/validators/billing.ts` (zod, mirroring `lib/validators/outstanding.ts`)

- `docType` / `status` / `gstMode` from the `db/enums.ts` const arrays.
- Dates: `/^\d{4}-\d{2}-\d{2}$/`. Due date ≥ document date.
- PAN: `/^[A-Z]{5}[0-9]{4}[A-Z]$/` — optional, but validated when present.
- GSTIN: `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/`, and its first two
  characters must equal the declared state code. Optional (non-GST customers).
- Email: zod email, optional. WhatsApp: E.164 `/^\+?[1-9]\d{7,14}$/`, optional.
- IFSC: `/^[A-Z]{4}0[A-Z0-9]{6}$/`, optional.
- At least one line; each line needs a name, `quantity > 0`, `rate >= 0`, and a
  `gstRate` in 0…28.
- **Generate** additionally requires a customer, a document date, at least one
  line, a total > 0, and — for a Tax Invoice — a seller GSTIN and a place of
  supply.
- Money arrives as strings and is parsed to 2dp; never trust a client float.

---

## 16. Design

Follow the existing app: the purple Billing accent already in
`app/(app)/billing/page.tsx`, `PageShell width="wide"`, rounded cards
(`rounded-[26px]` panels), `inset 0 0 0 1px var(--color-hairline)` hairlines with
soft drop shadows, the display font at 900 weight for headings and figures,
uppercase micro-labels with wide tracking, tabular numerals for **every** amount,
the `wg-rise` entry animation, lucide icons (`ReceiptIndianRupee`, `FileText`,
`FilePlus2`, `Send`, `Printer`). Type chips and status badges use the app's
existing status palette (`lib/status-palette.ts`) — do not invent colours.

Responsive: the filter bar wraps, the list becomes stacked cards on mobile, the
line editor becomes one card per line, and the totals panel moves inline. Every
icon-only control gets an `aria-label`; the type segmented control gets
`aria-pressed`.

---

## 17. Pitfalls — get these right the first time

1. **Snapshot, don't join.** A generated document renders from
   `seller_snapshot` / `customer_snapshot` / line snapshots. Editing a master
   later must never change a document that has already been issued.
2. **Never delete.** Cancel is a status. Conversion keeps the source. Lookups
   soft-delete via `is_active` so historical rows stay joinable.
3. **Number on generate, not on draft** — and allocate it atomically inside the
   insert transaction. Two users clicking Generate at once must not collide, and a
   tax-invoice series must have no gaps.
4. **Recompute totals on the server.** Posted totals are display state.
5. **A non-GST document hides the tax rows entirely** — it does not print
   `CGST 0.00`.
6. Don't touch `lib/queries/billing.ts`, `lib/billing/sheet.ts` or the existing
   `/billing` page behaviour. The Sheets ledger and the document engine coexist.
7. Extend `outstanding_products` additively; Outstanding must keep working
   unchanged. No second product master, no second entity master.
8. Local dates only — `formatDate` / `todayISO` (`lib/format.ts`,
   `lib/outstanding/horizon.ts`). Never `toISOString().slice(0,10)`, which shifts
   the day in IST.
9. Guard every asset read in the PDF (logo, signature). A missing file must never
   500 an invoice.
10. Everything must work under `pnpm dev:dummy` (PGlite, no Supabase, no Sheets,
    no Firebase). PDF generation must not depend on object storage; email and
    WhatsApp must degrade to a clear "not configured" message.
11. `revalidatePath` after every write, and `export const dynamic = "force-dynamic"`
    on every new page, as the rest of the app does.
12. Rate-limit and re-authorise **server-side** on every action; never trust an id
    from the client.

---

## 18. Build order

1. `db/enums.ts` additions + migration `0226_billing_documents.sql` + Drizzle
   tables and inferred types in `db/schema.ts`.
2. `lib/billing/numbering.ts` and `lib/billing/tax.ts` — **pure, with unit tests
   first** (FY boundaries, parallel allocation, the 18% intra/inter-state cases,
   round-off, zero-GST).
3. `lib/validators/billing.ts`, `lib/queries/billing-documents.ts`,
   `lib/billing/documents.ts` (the write core).
4. Admin Panel: billing profiles, customers, payment terms, SAC codes, product
   extensions. **This comes before the form** — the form reads these.
5. `/billing/documents` list.
6. `/billing/documents/new` + `[id]/edit`, with live totals.
7. `/billing/documents/[id]` detail + the shared invoice view model.
8. `lib/billing/invoice-pdf.ts` + `/billing/documents/[id]/pdf` + print CSS.
9. Convert + reference-document flow (one shared server path).
10. Email, then WhatsApp.
11. Permissions, nav, admin nav, and the catalogue test green.
12. A pass for empty/null states, mobile widths, and the dummy-mode run.

**Done means:** in `pnpm dev:dummy` I can configure an entity's PAN, GSTIN, bank,
logo and signature once in the Admin Panel; add a customer with an email and a
WhatsApp number; create a **Quotation** that auto-numbers `90001-26-27`; add two
service lines from the product master with their SAC codes; watch CGST 9% + SGST
9% compute themselves and the amount in words follow; generate it, email it,
convert it to a **Proforma Invoice**, convert that to a **Tax Invoice** — each
step numbering itself, carrying the customer, lines, GST and terms forward, and
printing "Ref: Quotation No. 90001-26-27" on the child — download a PDF that looks
like image 4, mark it paid, cancel a different one and still find it in the list,
and see all three documents linked to each other with a full event trail. Then
repeat the whole thing for a customer with **no GSTIN** and get a clean document
with no tax rows at all.

Start by telling me: how you are mapping this onto the existing masters, which of
my assumptions in §4 you are keeping, and anything in the images you cannot read.
Then build it.
