-- 0073_people_gives — People Gives: a referral / introduction database for the
-- Sales workspace. Four admin-managed lookup lists (soft-delete via is_active so
-- historical rows stay joinable) + the introductions table.
-- Idempotent + additive: CREATE TABLE/INDEX IF NOT EXISTS, seeds guarded by NOT EXISTS.

CREATE TABLE IF NOT EXISTS "pg_reference_sources" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL,
  "is_active"  boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pg_reference_sources_active_idx"
  ON "pg_reference_sources" ("is_active","sort_order","name");

CREATE TABLE IF NOT EXISTS "pg_designations" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL,
  "is_active"  boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pg_designations_active_idx"
  ON "pg_designations" ("is_active","sort_order","name");

CREATE TABLE IF NOT EXISTS "pg_business_categories" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL,
  "is_active"  boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pg_business_categories_active_idx"
  ON "pg_business_categories" ("is_active","sort_order","name");

CREATE TABLE IF NOT EXISTS "pg_sales_people" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL,
  "is_active"  boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pg_sales_people_active_idx"
  ON "pg_sales_people" ("is_active","sort_order","name");

CREATE TABLE IF NOT EXISTS "pg_introductions" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "received_on"          date NOT NULL DEFAULT CURRENT_DATE,
  "reference_source_id"  uuid REFERENCES "pg_reference_sources"("id") ON DELETE SET NULL,
  "introducer_first_name" text NOT NULL,
  "introducer_last_name"  text NOT NULL,
  "introducer_cell"      text,
  "prospect_company"     text NOT NULL,
  "prospect_first_name"  text NOT NULL,
  "prospect_last_name"   text NOT NULL,
  "designation_id"       uuid REFERENCES "pg_designations"("id") ON DELETE SET NULL,
  "business_category_id" uuid REFERENCES "pg_business_categories"("id") ON DELETE SET NULL,
  "nature_of_business"   text NOT NULL,
  "notes"                text,
  "next_reminder_date"   date,
  "sales_person_id"      uuid REFERENCES "pg_sales_people"("id") ON DELETE SET NULL,
  "created_by_id"        uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pg_introductions_created_idx"  ON "pg_introductions" ("created_at");
CREATE INDEX IF NOT EXISTS "pg_introductions_company_idx"  ON "pg_introductions" ("prospect_company");
CREATE INDEX IF NOT EXISTS "pg_introductions_reminder_idx" ON "pg_introductions" ("next_reminder_date");

-- Seeds — idempotent + case-insensitive.
INSERT INTO "pg_reference_sources" ("name","sort_order")
  SELECT v.name, v.ord FROM (VALUES ('BNI',1),('BEL',2),('Ascent',3)) AS v(name,ord)
  WHERE NOT EXISTS (SELECT 1 FROM "pg_reference_sources" s WHERE lower(s.name) = lower(v.name));

INSERT INTO "pg_sales_people" ("name","sort_order")
  SELECT v.name, v.ord FROM (VALUES ('Manan',1),('Mishtie',2)) AS v(name,ord)
  WHERE NOT EXISTS (SELECT 1 FROM "pg_sales_people" s WHERE lower(s.name) = lower(v.name));
