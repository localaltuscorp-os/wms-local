-- 0254 — Restrictive scoped temporary access. Additive only; legacy delegated
-- access remains untouched and continues to resolve existing token sessions.

CREATE TABLE IF NOT EXISTS scoped_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoped_access_grants_dates_chk CHECK (expires_at > starts_at)
);

CREATE TABLE IF NOT EXISTS scoped_access_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES scoped_access_grants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoped_access_recipient_uniq UNIQUE (grant_id, employee_id)
);

CREATE TABLE IF NOT EXISTS scoped_access_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES scoped_access_recipients(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  access_level text NOT NULL CHECK (access_level IN ('full', 'viewing', 'custom')),
  navigation_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoped_access_scope_uniq UNIQUE (recipient_id, module_key)
);

CREATE INDEX IF NOT EXISTS scoped_access_grants_live_idx ON scoped_access_grants(expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS scoped_access_recipients_employee_idx ON scoped_access_recipients(employee_id, revoked_at);
CREATE INDEX IF NOT EXISTS scoped_access_scopes_recipient_idx ON scoped_access_scopes(recipient_id);
