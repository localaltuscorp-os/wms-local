-- 0170 — KPI Management (HR-staff-only). Per-person KPI assignments that
-- REFERENCE the appraisal KPI dictionary (lib/performance/kpi-dictionary.ts)
-- as the catalog, plus an APPEND-ONLY history log that is never overwritten.
-- Additive + idempotent — safe to re-run. All state columns are `text`
-- (house norm — not pgEnums); db/enums.ts holds the canonical unions.

CREATE TABLE IF NOT EXISTS kpi_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- References a KPI-dictionary line/target key when picked from the catalog;
  -- NULL for a manually-entered KPI.
  kpi_key            text,
  kpi_name           text NOT NULL,
  category           text NOT NULL DEFAULT '',
  -- weekly | monthly | quarterly | annual
  frequency          text NOT NULL DEFAULT 'monthly',
  weightage          integer NOT NULL DEFAULT 0,
  -- e.g. "2026-Q2"
  effective_quarter  text NOT NULL DEFAULT '',
  -- stored as text so numeric OR descriptive targets both fit; achievement %
  -- parses the numeric prefix. current_value is nullable (may be computed later).
  target_value       text NOT NULL DEFAULT '',
  current_value      text,
  -- the "Applicable this quarter" toggle.
  applicable         boolean NOT NULL DEFAULT true,
  -- active | inactive
  status             text NOT NULL DEFAULT 'active',
  created_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  archived           boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS kpi_assignments_employee_idx ON kpi_assignments (employee_id);
CREATE INDEX IF NOT EXISTS kpi_assignments_employee_quarter_idx ON kpi_assignments (employee_id, effective_quarter);

-- APPEND-ONLY. Every create/modify/activate/deactivate/remove writes one row
-- here; existing rows are NEVER updated or deleted (the audit trail).
CREATE TABLE IF NOT EXISTS kpi_assignment_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL REFERENCES kpi_assignments(id) ON DELETE CASCADE,
  -- assigned | updated | activated | deactivated | removed
  --         | weightage_changed | target_changed
  change_type    text NOT NULL,
  previous       jsonb,
  updated        jsonb,
  changed_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  changed_on     timestamptz NOT NULL DEFAULT now(),
  reason         text
);
CREATE INDEX IF NOT EXISTS kpi_assignment_history_assignment_idx ON kpi_assignment_history (assignment_id);
CREATE INDEX IF NOT EXISTS kpi_assignment_history_changed_on_idx ON kpi_assignment_history (changed_on);
