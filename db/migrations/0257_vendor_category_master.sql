-- 0257 — Operations · Vendor Category Master and expanded Vendor Directory.
--
-- Additive, forward-only migration. Existing vendor records stay readable;
-- the application enforces the newly required fields for all future saves and
-- imports. Existing hard-coded suggestions and every category already in use
-- are seeded into the new master so legacy rows remain valid selections.

CREATE TABLE IF NOT EXISTS "ops_vendor_categories" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          text NOT NULL,
  "is_active"     boolean NOT NULL DEFAULT true,
  "sort_order"    integer NOT NULL DEFAULT 0,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ops_vendor_categories_name_uidx"
  ON "ops_vendor_categories" (lower("name"));
CREATE INDEX IF NOT EXISTS "ops_vendor_categories_active_idx"
  ON "ops_vendor_categories" ("is_active", "sort_order");

ALTER TABLE "ops_vendors"
  ADD COLUMN IF NOT EXISTS "company_name" text,
  ADD COLUMN IF NOT EXISTS "whatsapp_cell_no" text,
  ADD COLUMN IF NOT EXISTS "office_open_time" time,
  ADD COLUMN IF NOT EXISTS "office_end_time" time,
  ADD COLUMN IF NOT EXISTS "business_card_front_path" text,
  ADD COLUMN IF NOT EXISTS "business_card_back_path" text,
  ADD COLUMN IF NOT EXISTS "catalogue_path" text,
  ADD COLUMN IF NOT EXISTS "additional_links" text[] NOT NULL DEFAULT '{}'::text[];

-- Existing vendors get the same useful first value as the new form: WhatsApp
-- begins as Cell No. and remains independently editable afterwards.
UPDATE "ops_vendors"
SET "whatsapp_cell_no" = "cell_no"
WHERE COALESCE(btrim("whatsapp_cell_no"), '') = ''
  AND COALESCE(btrim("cell_no"), '') <> '';

INSERT INTO "ops_vendor_categories" ("name", "sort_order")
VALUES
  ('AC', 10), ('Broadband', 20), ('Carpenter', 30), ('Catering', 40),
  ('CCTV', 50), ('Computer Repairs', 60), ('Courier', 70), ('Electrician', 80),
  ('IT Hardware', 90), ('Pest Control', 100), ('Plumber', 110), ('Printing', 120),
  ('Stationery', 130), ('Travel', 140), ('Other', 150)
ON CONFLICT DO NOTHING;

INSERT INTO "ops_vendor_categories" ("name")
SELECT DISTINCT btrim("category")
FROM "ops_vendors"
WHERE btrim("category") <> ''
ON CONFLICT DO NOTHING;
