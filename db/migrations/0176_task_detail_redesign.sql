-- 0176 · Task detail redesign — checklist sub-items, attachments, estimated time.
-- Backs the mockup-matched task detail page (Checklist card, Attachments manager,
-- Estimated vs Actual time). Idempotent.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes integer;

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label         text NOT NULL,
  done          boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  done_by_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  done_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_checklist_task_idx ON task_checklist_items (task_id, sort_order);

CREATE TABLE IF NOT EXISTS task_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  file_name      text NOT NULL,
  mime           text,
  size_bytes     integer,
  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_attachments_task_idx ON task_attachments (task_id, created_at);
