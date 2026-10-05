-- Upload Master: saved mandatory-field overrides per template variant.
-- No row preserves the importer/template's existing code-defined defaults.
CREATE TABLE IF NOT EXISTS template_field_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text NOT NULL,
  variant         text NOT NULL DEFAULT 'default',
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by_id   uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS template_field_configs_key_variant_uq
  ON template_field_configs (key, variant);
