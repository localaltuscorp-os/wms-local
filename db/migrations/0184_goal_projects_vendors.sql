-- 0184 — "Part of Project?" on goals + a managed VENDOR master.
--
-- Sir: on Yearly / Quarterly / Monthly / Weekly goals, offer "Part of Project?
-- Yes / No" (in the table AND the + Add Goal popup). When Yes, tag the goal to a
-- project, and tag the project's ACTIONS to the person and — where relevant —
-- the vendor.
--
-- Vendors get their OWN master table (the same managed-list shape as
-- `departments`) rather than free text, so the same vendor reads identically on
-- every goal and action and can be reported on later.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS everywhere) — the drizzle journal in this repo
-- is out of sync, so migrations are applied by running this SQL directly.

-- ── 1. The vendor master ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendors_active_idx ON vendors (is_active, sort_order, name);

-- ── 2. Y/Q/M goals ──────────────────────────────────────────────────────────
-- is_project is the explicit Yes/No the user answers; project_node_id is only
-- meaningful when it is true. ON DELETE SET NULL on both refs so deleting a
-- project or a vendor never cascades away someone's goal.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS is_project      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_node_id uuid REFERENCES project_nodes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id       uuid REFERENCES vendors (id)       ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS goals_project_node_idx ON goals (project_node_id);
CREATE INDEX IF NOT EXISTS goals_vendor_idx       ON goals (vendor_id);

-- ── 3. Weekly goals (their own table) ───────────────────────────────────────
ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS is_project      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_node_id uuid REFERENCES project_nodes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id       uuid REFERENCES vendors (id)       ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS weekly_goals_project_node_idx ON weekly_goals (project_node_id);
CREATE INDEX IF NOT EXISTS weekly_goals_vendor_idx       ON weekly_goals (vendor_id);

-- ── 4. Project nodes carry the vendor ───────────────────────────────────────
-- "…and the vendor if relevant": an ACTION inside a project is what actually
-- gets done, so the vendor is tagged on the node itself (any node kind may
-- carry one; in practice it is set on kind='action'). The person is already
-- covered by project_nodes.owner_id + project_members.
ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_nodes_vendor_idx ON project_nodes (vendor_id);
