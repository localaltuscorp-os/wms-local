-- 0166 — Policy CMS: admin-editable policies + version history + compliance
-- re-signing, plus the secondary Admin PIN. Idempotent, safe to re-run.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS admin_pin_hash text;

CREATE TABLE IF NOT EXISTS policy_documents (
  key               text PRIMARY KEY,
  title             text NOT NULL,
  doc_code          text NOT NULL DEFAULT '',
  category          text NOT NULL DEFAULT 'policy',
  badge             text NOT NULL DEFAULT '',
  blurb             text NOT NULL DEFAULT '',
  summary           text NOT NULL DEFAULT '',
  owner             text NOT NULL DEFAULT '',
  registered_office text NOT NULL DEFAULT '',
  hr_email          text NOT NULL DEFAULT '',
  entity_default    text NOT NULL DEFAULT 'altus-corp',
  current_version   integer NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'published',
  updated_by_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key       text NOT NULL,
  version          integer NOT NULL,
  title            text NOT NULL,
  doc_code         text NOT NULL DEFAULT '',
  effective_date   text NOT NULL DEFAULT '',
  summary          text NOT NULL DEFAULT '',
  sections         jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  published_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_key_version_uk ON policy_versions (policy_key, version);

CREATE TABLE IF NOT EXISTS policy_compliance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key      text NOT NULL,
  version         integer NOT NULL,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending',
  signed_at       timestamptz,
  doc_instance_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_compliance_key_emp_uk ON policy_compliance (policy_key, employee_id);
