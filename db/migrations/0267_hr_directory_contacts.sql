-- 0267 - HR Directory: vendors and HR consultants in the existing HR contact register.
-- Additive. Existing Address Book contacts remain valid and appear as Vendors.

ALTER TABLE "hr_contacts"
  ADD COLUMN IF NOT EXISTS "directory_type" text NOT NULL DEFAULT 'vendor',
  ADD COLUMN IF NOT EXISTS "contact_2_name" text,
  ADD COLUMN IF NOT EXISTS "contact_2_cell_no" text,
  ADD COLUMN IF NOT EXISTS "contact_2_email" text;

UPDATE "hr_contacts"
SET "directory_type" = 'vendor'
WHERE "directory_type" IS NULL OR "directory_type" NOT IN ('vendor', 'hr_consultant');

DO $$ BEGIN
  ALTER TABLE "hr_contacts"
    ADD CONSTRAINT "hr_contacts_directory_type_check"
    CHECK ("directory_type" IN ('vendor', 'hr_consultant'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "hr_contacts_directory_type_idx"
  ON "hr_contacts" ("directory_type", "is_active", "person_name");
