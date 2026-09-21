-- 0219 — THE PERMISSION MATRIX: module → sub-module → sub-sub-module, with
--        SHOW / VIEW / EDIT per employee.
--
-- ── WHY THE TREE IS NOT A TABLE ────────────────────────────────────────────
-- Only the GRANTS live in the database. The tree itself — which modules exist,
-- which sub-modules they contain, which route each one guards — is CODE, in
-- lib/permissions/catalog.ts, derived from the application's real navigation and
-- real routes.
--
-- That is deliberate and it is the most important design decision here. A
-- permission node is only meaningful if something enforces it, and what
-- enforces it is a route handler or a page guard — i.e. code. Storing the tree
-- in a table would let an admin create a node that guards nothing (a permission
-- that silently grants everything) or delete a node that a route still checks
-- (a guard that silently refuses everyone), and neither failure is visible on
-- the screen where it was caused. Keeping the tree in code means the catalogue
-- cannot drift from the app: a test walks the catalogue and asserts every node
-- names a route that exists.
--
-- So this migration stores exactly one thing: for a given employee and a given
-- node key, may they SEE it, READ it, and CHANGE it.
--
-- ── DEFAULT-OPEN, NOT DEFAULT-CLOSED ───────────────────────────────────────
-- The absence of a row means "fall back to the authorization the application
-- already has" — the admin flag, the workspace/department gates, the capability
-- registry, each page's own guard. It does NOT mean "denied".
--
-- This is the only safe way to add a matrix to a live application. Default-deny
-- with an empty table locks all ~40 modules for all ~30 staff the moment the
-- migration lands, and every one of those lockouts looks like a bug rather than
-- a policy. A row is therefore an OVERRIDE, written deliberately by a master
-- admin, and an override can only ever NARROW what the existing model allows —
-- see lib/permissions/resolve.ts, where the effective answer is the AND of the
-- two. Granting through this table alone can never widen someone's reach past
-- the guards that were already there.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The grants
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- A dotted path into the catalogue: 'wms', 'wms.tasks', 'wms.tasks.report'.
  -- Text, not an enum: the catalogue changes with every module that ships, and a
  -- pgEnum would need a migration per node while giving nothing in return —
  -- validity is checked against the code catalogue on write, which an enum
  -- cannot do either (it cannot know whether the route still exists).
  node_key text NOT NULL,

  -- THE THREE ACTIONS, as the brief names them.
  --
  --   can_show — does this appear in their navigation at all
  --   can_view — may they read the data behind it
  --   can_edit — may they change it
  --
  -- Stored as three independent booleans rather than one "level" column,
  -- because the brief's own example (Show: YES, View: YES, Edit: NO) treats them
  -- as independent, and because a hidden-but-readable module is a real
  -- configuration: a surface reached by deep link from an email, deliberately
  -- kept off the rail.
  --
  -- They default to TRUE, matching the default-open rule above: a row created
  -- to deny EDIT on one node must not accidentally deny SHOW and VIEW on it too.
  can_show boolean NOT NULL DEFAULT true,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,

  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per person per node. The write path upserts on this.
  CONSTRAINT module_permissions_employee_node_uniq UNIQUE (employee_id, node_key)
);

-- The resolver loads every override for ONE employee in one go and caches it for
-- the request, so this index is the whole read pattern.
CREATE INDEX IF NOT EXISTS module_permissions_employee_idx
  ON module_permissions (employee_id);

-- The matrix screen also reads a whole COLUMN: "who has been denied this node".
CREATE INDEX IF NOT EXISTS module_permissions_node_idx
  ON module_permissions (node_key);

------------------------------------------------------------------------
-- 2. The audit trail
------------------------------------------------------------------------
-- Changing who can see payroll is exactly the kind of change that needs to be
-- answerable six months later. `module_permissions` holds only the CURRENT
-- state, so the history goes here.
--
-- Append-only, and it records both sides of the change: a row saying "edit was
-- switched off" is nearly useless without "…and it had been on".

CREATE TABLE IF NOT EXISTS module_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalised, like the delegated-access log: an anonymised employee must not
  -- take the record of permission decisions with them.
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  node_key text NOT NULL,

  -- NULL = there was no override before / after (i.e. the node fell back to the
  -- application's own authorization). Distinct from false, which is an explicit
  -- deny, and the distinction is the whole point of default-open.
  prev_show boolean,
  prev_view boolean,
  prev_edit boolean,
  next_show boolean,
  next_view boolean,
  next_edit boolean,

  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_permission_events_employee_idx
  ON module_permission_events (employee_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS module_permission_events_recent_idx
  ON module_permission_events (occurred_at DESC);
