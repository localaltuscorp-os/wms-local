-- Access Control — grants of ELEVATED visibility, by domain.
--
-- Two domains share this table and one rule:
--   domain = 'tasks'      → whose work a person may read (lib/tasks/scope.ts)
--   domain = 'incentive'  → whose incentive earnings they may read
--                           (lib/incentive/analytics/scope.ts)
--
-- Both modules are scoped to the signed-in person plus their downline by
-- default. A row here widens that for one person: target_id NULL means the whole
-- organisation, a target means that person and their downline. Rows are written
-- only from Admin Panel → Access Control, by a master admin.
CREATE TABLE IF NOT EXISTS visibility_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text NOT NULL CHECK (domain IN ('tasks', 'incentive')),
  employee_id   uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  target_id     uuid REFERENCES employees (id) ON DELETE CASCADE,
  note          text,
  granted_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One grant per (domain, person, target) pair. Postgres treats NULLs as distinct
-- in a plain unique index, so the organisation-wide grant (target NULL) needs
-- its own partial index to stay single as well.
CREATE UNIQUE INDEX IF NOT EXISTS visibility_grants_domain_employee_target_uq
  ON visibility_grants (domain, employee_id, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS visibility_grants_domain_employee_org_uq
  ON visibility_grants (domain, employee_id)
  WHERE target_id IS NULL;

CREATE INDEX IF NOT EXISTS visibility_grants_employee_idx
  ON visibility_grants (employee_id);
