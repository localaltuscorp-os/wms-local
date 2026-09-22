-- 0227 — THE PERMISSION TREE'S PRESENTATION BECOMES EDITABLE.
--
-- The permission matrix's tree is generated from the application's real routes
-- and validated against them by tests/unit/permission-catalog.test.ts. That
-- validation is a FEATURE, not an obstacle: a permission node is only meaningful
-- if something enforces it, and what enforces it is a route guard, i.e. code.
--
-- So the tree keeps its SHAPE in code and gains a PRESENTATION layer here: a
-- master admin can rename a node, rewrite its one-line note, reorder it, or hide
-- it from the matrix screen. Nothing here can grant access — the resolver only
-- ever narrows, and there is no column in this table that a guard reads.
--
-- ── WHAT CANNOT BE MADE EDITABLE, AND WHY (do not "fix" these later) ────────
--   node_key   Persisted in module_permissions.node_key. Renaming one would
--              orphan every stored grant silently, leaving rows that govern
--              nothing.
--   routes     Validated against real page files on disk. A route added here
--              would be a switch wired to nothing: it renders as "denied" on
--              screen while the module stays wide open. That is the single
--              failure mode the matrix exists to prevent.
--   structure  flatten() THROWS past depth 3 and nodeChain() derives inheritance
--              from the code tree, so a database-parented node would change what
--              a denial cascades to, invisibly.
--   new nodes  There is no route to guard a new node and no guard to satisfy a
--              deleted one.
--
-- ── THE INVARIANT, AND IT IS LOAD-BEARING ───────────────────────────────────
-- `hidden_in_matrix` curates THE MATRIX SCREEN ONLY. It must NEVER be read by
-- `hiddenModuleKeys()` or `requireModuleView()` in lib/permissions/resolve.ts.
-- If it is, "hidden in the matrix" silently becomes "hidden in the application"
-- — a permission change made through a presentation control, with no audit row
-- saying so. There is a unit test asserting this; do not delete it.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS permission_node_settings (
  node_key text PRIMARY KEY,                   -- must exist in the code catalogue
  label_override text,                         -- admin-facing display name
  note_override  text,                         -- the one-line explanation on the matrix
  hidden_in_matrix boolean NOT NULL DEFAULT false,  -- curate the matrix, NOT the app
  sort_order integer,                          -- present the tree in house order
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- APPEND-ONLY, mirroring module_permission_events (0219): the trail must show
-- every rename and every hide, not just the current label.
CREATE TABLE IF NOT EXISTS permission_catalog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_key text NOT NULL,
  prev_label text,  next_label text,
  prev_note  text,  next_note  text,
  prev_hidden boolean, next_hidden boolean,
  prev_sort integer,   next_sort integer,
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permission_catalog_events_node_idx
  ON permission_catalog_events (node_key, occurred_at DESC);

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from information_schema.tables
--       where table_name in ('permission_node_settings','permission_catalog_events')) = 2
--       as both_tables_exist,
--     (select count(*) from permission_node_settings) = 0 as tree_unchanged_yet;
