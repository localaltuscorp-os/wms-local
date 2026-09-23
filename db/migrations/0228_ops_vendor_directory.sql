-- 0228 — Operations · Vendor Directory.
--
-- Additive only: one new table, no change to anything existing.
--
-- ops_vendors lists every outside vendor Altus Corp works with — category,
-- contact person, full postal address, website and whether they are under an
-- AMC. `is_active` separates current vendors from ones no longer used; inactive
-- rows are kept (and listed separately), never silently deleted.
--
-- Deliberately NOT hr_contacts: that is HR's Address Book of service people
-- (company + one person + service). The directory needs a postal address and an
-- AMC flag, and it belongs to Operations.

CREATE TABLE IF NOT EXISTS "ops_vendors" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category"      text NOT NULL DEFAULT 'Other',
  "first_name"    text NOT NULL,
  "last_name"     text,
  "cell_no"       text,
  "email"         text,
  "address_line1" text,
  "address_line2" text,
  "address_line3" text,
  "address_line4" text,
  "landmark"      text,
  "city"          text,
  "state"         text,
  "pincode"       text,
  "website"       text,
  "amc"           boolean NOT NULL DEFAULT false,
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ops_vendors_active_idx" ON "ops_vendors" ("is_active");
CREATE INDEX IF NOT EXISTS "ops_vendors_category_idx" ON "ops_vendors" ("category");
