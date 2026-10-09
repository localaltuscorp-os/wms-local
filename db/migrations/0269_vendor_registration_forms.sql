-- 0269 - Vendor registration forms and secure public collection links.
-- Additive: existing Address Book and Directory contacts remain untouched.

ALTER TABLE "hr_contacts"
  ADD COLUMN IF NOT EXISTS "first_name" text,
  ADD COLUMN IF NOT EXISTS "last_name" text,
  ADD COLUMN IF NOT EXISTS "category" text,
  ADD COLUMN IF NOT EXISTS "utility" text,
  ADD COLUMN IF NOT EXISTS "amc_on_call" text,
  ADD COLUMN IF NOT EXISTS "address_line_1" text,
  ADD COLUMN IF NOT EXISTS "address_line_2" text,
  ADD COLUMN IF NOT EXISTS "address_line_3" text,
  ADD COLUMN IF NOT EXISTS "address_line_4" text,
  ADD COLUMN IF NOT EXISTS "pincode" text,
  ADD COLUMN IF NOT EXISTS "gst_no" text,
  ADD COLUMN IF NOT EXISTS "pan_no" text,
  ADD COLUMN IF NOT EXISTS "gst_name" text,
  ADD COLUMN IF NOT EXISTS "bank_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "contact_1_name" text,
  ADD COLUMN IF NOT EXISTS "contact_1_cell_no" text,
  ADD COLUMN IF NOT EXISTS "contact_1_email" text,
  ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "rate_negotiated" text,
  ADD COLUMN IF NOT EXISTS "payment_terms" text,
  ADD COLUMN IF NOT EXISTS "registration_submitted_at" timestamptz;

CREATE TABLE IF NOT EXISTS "vendor_registration_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL REFERENCES "hr_contacts"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "submitted_at" timestamptz,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vendor_registration_links_contact_idx"
  ON "vendor_registration_links" ("contact_id");
CREATE INDEX IF NOT EXISTS "vendor_registration_links_expiry_idx"
  ON "vendor_registration_links" ("expires_at");
