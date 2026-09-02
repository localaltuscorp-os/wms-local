-- 0039 — pinned_items
-- Per-user shelf of pinned tasks / projects / docs surfaced on /profile.
-- No FK to the target rows; pins survive the underlying item being deleted
-- (the UI just shows them as "removed").

CREATE TABLE IF NOT EXISTS pinned_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('task','project','document')),
  item_id     uuid NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  pinned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, kind, item_id)
);

CREATE INDEX IF NOT EXISTS pinned_items_employee_idx
  ON pinned_items (employee_id, sort_order);
