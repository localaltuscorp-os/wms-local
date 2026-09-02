-- 0179 — Enterprise Communications (ECOS): broadcasts + per-recipient receipts.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'announcement',
  priority text NOT NULL DEFAULT 'normal',
  ack_mode text NOT NULL DEFAULT 'read',
  require_lock boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  author_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  author_identity text NOT NULL DEFAULT 'hr',
  sender_name text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels jsonb NOT NULL DEFAULT '["in_app","email"]'::jsonb,
  recipient_count integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broadcasts_status_idx ON broadcasts(status);
CREATE INDEX IF NOT EXISTS broadcasts_published_idx ON broadcasts(published_at);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  delivered_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  delivered_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_recipient_uq ON broadcast_recipients(broadcast_id, employee_id);
CREATE INDEX IF NOT EXISTS broadcast_recipient_emp_idx ON broadcast_recipients(employee_id, status);
