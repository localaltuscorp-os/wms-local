-- 0227 — HR module · Address Book of Resources + Asset Register.
--
-- Additive only: three new tables, no change to anything existing.
--
-- ── ADDRESS BOOK ────────────────────────────────────────────────────────────
-- hr_contacts holds the OUTSIDE resources (AC, Aquaguard, Broadband, CCTV,
-- Carpenter, Electrician, Stationery, Computer Repairs, …). Employees are NOT
-- copied in here: the Address Book reads them live from `employees` and their
-- onboarding form, so a changed phone number is never stale in two places.
-- `is_active` separates current resources from ones no longer used; inactive
-- rows are kept (and listed separately), never silently deleted.
--
-- ── ASSET REGISTER ──────────────────────────────────────────────────────────
-- hr_assets.asset_code is PER TYPE: LAP-0001, MON-0001, … Each type's running
-- number lives in hr_asset_counters and is taken with a single
-- INSERT … ON CONFLICT DO UPDATE … RETURNING, which is atomic — two HR people
-- saving a laptop at the same moment cannot receive the same code. Gaps (a
-- deleted asset) are expected: a code identifies an asset, it does not count them.
--
-- password_enc is AES-256-GCM ciphertext (lib/accounts/crypto.ts). The plaintext
-- is never stored and is only decrypted by the editor-gated reveal action.

CREATE TABLE IF NOT EXISTS "hr_contacts" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_name"  text,
  "person_name"   text NOT NULL,
  "cell_no"       text,
  "alternate_no"  text,
  "email"         text,
  "service"       text NOT NULL DEFAULT 'Other',
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_contacts_active_idx" ON "hr_contacts" ("is_active");
CREATE INDEX IF NOT EXISTS "hr_contacts_service_idx" ON "hr_contacts" ("service");

CREATE TABLE IF NOT EXISTS "hr_asset_counters" (
  "prefix" text PRIMARY KEY,
  "last"   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "hr_assets" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "asset_code"         text NOT NULL UNIQUE,
  "asset_type"         text NOT NULL,
  "asset_name"         text NOT NULL,
  "location"           text,
  "serial_no"          text,
  "model"              text,
  "make"               text,
  "description"        text,
  "specifications"     text,
  "warranty_until"     date,
  "under_amc"          boolean NOT NULL DEFAULT false,
  "vendor_name"        text,
  "photo_path"         text,
  "invoice_path"       text,
  -- 'person' | 'office' | 'none'
  "issued_kind"        text NOT NULL DEFAULT 'none'
                       CHECK ("issued_kind" IN ('person', 'office', 'none')),
  "issued_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "issued_office"      text,
  "notes"              text,
  "username"           text,
  "password_enc"       text,
  "created_by_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_assets_type_idx" ON "hr_assets" ("asset_type");
CREATE INDEX IF NOT EXISTS "hr_assets_issued_employee_idx" ON "hr_assets" ("issued_employee_id");
