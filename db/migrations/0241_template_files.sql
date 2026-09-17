-- Upload Master — the uploaded override for a bulk-import template.
-- One row per overridden template (key), no row = built-in template served.
CREATE TABLE IF NOT EXISTS template_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL,
  storage_path  text NOT NULL,
  content_type  text NOT NULL,
  file_name     text NOT NULL,
  file_size     integer NOT NULL,
  updated_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS template_files_key_uq ON template_files (key);
