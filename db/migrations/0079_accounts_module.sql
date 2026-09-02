-- 0079 — Accounts Totality, Compliance, Checklist & Trackers module.
-- Admin/Manager-only module. CA Handover credentials are stored ENCRYPTED at rest.

-- Generic per-kind lookup for the module's searchable dropdowns (inline add +
-- soft delete). kind e.g. 'task_status' | 'task_gear' | 'shot_gear' | 'shot_freq'.
CREATE TABLE IF NOT EXISTS "accounts_lookups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL,
  "value" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_lookups_kind_val_uq" ON "accounts_lookups" ("kind", lower("value"));

-- Section 1 — Accounts Task List
CREATE TABLE IF NOT EXISTS "accounts_task_list" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sr_no" integer,
  "area" text,
  "task_description" text,
  "status" text NOT NULL DEFAULT 'Pending',
  "links" text,
  "target_date" date,
  "actual_date" date,
  "gear" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "accounts_task_list_status_idx" ON "accounts_task_list" ("status");

-- Section 1b — Screenshots to Post (sub-table)
CREATE TABLE IF NOT EXISTS "accounts_screenshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sr_no" integer,
  "project_name" text,
  "project_details" text,
  "frequency" text,
  "target_date" date,
  "actual_date" date,
  "gear" text,
  "notes" text,
  "sort_order" integer,
  "archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Section — CA Handover credentials (SENSITIVE; password_enc is AES-256-GCM ciphertext)
CREATE TABLE IF NOT EXISTS "ca_handover_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "portal_type" text NOT NULL,
  "entity_name" text NOT NULL,
  "username" text,
  "password_enc" text,
  "phone" text,
  "default_email" text,
  "website_link" text,
  "email_updated" boolean NOT NULL DEFAULT false,
  "password_reset" boolean NOT NULL DEFAULT false,
  "primary_phone_updated" boolean NOT NULL DEFAULT false,
  "secondary_phone_updated" boolean NOT NULL DEFAULT false,
  "note" text,
  "sort_order" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ca_handover_credentials_portal_idx" ON "ca_handover_credentials" ("portal_type");

-- Section — CA Handover returns archive (per FY + entity: IT + GST document links)
CREATE TABLE IF NOT EXISTS "ca_handover_returns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fy" text NOT NULL,
  "entity_name" text NOT NULL,
  -- Income-tax document links
  "itr_v" text, "filed_computation" text, "filed_itr_form" text,
  "balance_sheet" text, "pnl" text, "tax_audit_report" text,
  "self_assessment_challan" text, "form_26as" text, "ais" text,
  "assessment_order" text, "refund_as_per_return" text, "refund_received" text,
  -- GST return links
  "gstr_1" text, "gstr_3b" text, "gstr_2b" text, "gst_working_excel" text, "gstr_9" text,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ca_handover_returns_fy_entity_uq" ON "ca_handover_returns" ("fy", lower("entity_name"));

-- Seed the default dropdown options (idempotent).
INSERT INTO "accounts_lookups" ("kind","value","sort_order") VALUES
  ('task_status','Pending',1),('task_status','Done',2),('task_status','Need Help',3),
  ('task_gear','Delegate',1),('task_gear','Support',2),('task_gear','Courier',3),
  ('shot_gear','Delegate',1),('shot_gear','Support',2),('shot_gear','Courier',3)
ON CONFLICT ("kind", lower("value")) DO NOTHING;
