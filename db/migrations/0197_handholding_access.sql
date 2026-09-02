-- Hand-holding · Access / Permissions.
--
-- One row per grant recorded in the dialog. The ROLE MATRIX itself stays in
-- code (only Admin edits or deletes) — this table records the specific
-- module/section/action grants an admin has written down, never widens a role.

CREATE TABLE IF NOT EXISTS hh_access_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL,          -- admin | hr | ruchita
  module      text NOT NULL,          -- handholding | ambassadors | development
  section     text NOT NULL,
  action      text NOT NULL,          -- add | edit | delete | view
  description text,
  created_by  uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module, section, action)
);

CREATE INDEX IF NOT EXISTS hh_access_grants_role_idx ON hh_access_grants (role);
