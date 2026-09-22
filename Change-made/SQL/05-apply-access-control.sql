-- ============================================================================
-- 05 — Access Control: elevated visibility grants, for Tasks AND Incentive.
--
-- WHAT THIS IS. Two modules scope their reads, on the server, to the signed-in
-- person plus the people below them in the reporting tree:
--
--   domain = 'tasks'      → whose WORK they may read   (lib/tasks/scope.ts)
--   domain = 'incentive'  → whose EARNINGS they may read
--                           (lib/incentive/analytics/scope.ts)
--
-- A row in `visibility_grants` widens that for one person:
--
--   target_id IS NULL  → that person may read the WHOLE organisation
--   target_id = <uuid> → that person may read THAT person and their downline
--
-- Rows are written only from Admin Panel → Access Control, by a master admin
-- (the two accounts holding `master_admin.manage` in lib/security/capabilities.ts).
-- Being an admin widens nothing here; this table is the only thing that does.
--
-- Additive and idempotent: safe to run against production as-is, and safe to
-- run twice. It also UPGRADES the earlier single-domain table (see step 2).
-- ============================================================================

-- 1. FRESH INSTALL -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text NOT NULL CHECK (domain IN ('tasks', 'incentive')),
  employee_id   uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  target_id     uuid REFERENCES employees (id) ON DELETE CASCADE,
  note          text,
  granted_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. UPGRADE FROM THE EARLIER NAME -------------------------------------------
-- The first version of this file created `task_view_grants`, Tasks only. If that
-- table is present it IS these grants, so it is renamed rather than recreated:
-- every existing row keeps its ids, its note and its grantor, and belongs to the
-- 'tasks' domain. Nothing is dropped and nothing is re-granted by hand.
DO $$
BEGIN
  IF to_regclass('public.task_view_grants') IS NOT NULL
     AND to_regclass('public.visibility_grants') IS NULL THEN
    ALTER TABLE task_view_grants RENAME TO visibility_grants;

    ALTER TABLE visibility_grants ADD COLUMN domain text;
    UPDATE visibility_grants SET domain = 'tasks' WHERE domain IS NULL;
    ALTER TABLE visibility_grants ALTER COLUMN domain SET NOT NULL;

    -- The check constraint, only if one is not already there (the rename keeps
    -- the table's own constraints; a fresh table made in step 1 already has it).
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'visibility_grants'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%domain%'
    ) THEN
      ALTER TABLE visibility_grants
        ADD CONSTRAINT visibility_grants_domain_check
        CHECK (domain IN ('tasks', 'incentive'));
    END IF;

    -- The old indexes are replaced by the pair below, which is keyed by domain.
    DROP INDEX IF EXISTS task_view_grants_employee_target_uq;
    DROP INDEX IF EXISTS task_view_grants_org_uq;
    DROP INDEX IF EXISTS task_view_grants_employee_idx;
  END IF;
END $$;

-- 3. INDEXES -----------------------------------------------------------------
-- ONE grant per (domain, person, target). Postgres treats NULLs as distinct in a
-- plain unique index, so the organisation-wide grant (target NULL) needs the
-- partial index below to stay single as well.
CREATE UNIQUE INDEX IF NOT EXISTS visibility_grants_domain_employee_target_uq
  ON visibility_grants (domain, employee_id, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS visibility_grants_domain_employee_org_uq
  ON visibility_grants (domain, employee_id)
  WHERE target_id IS NULL;

CREATE INDEX IF NOT EXISTS visibility_grants_employee_idx
  ON visibility_grants (employee_id);
