-- ===========================================================================
--  RUN IN SUPABASE — migrations 0216 to 0220
--  Altus WMS · branch `Om` · generated 2026-09-10
-- ===========================================================================
--
--  WHAT THIS IS
--    The five migrations the `Om` branch needs which have NOT been applied to
--    Supabase yet. Until they run, master-admin, the permission matrix,
--    delegated access, manager history and reimbursement attachments all fail
--    at runtime because their tables do not exist.
--
--    Generated verbatim from db/migrations/*.sql — the prose headers are
--    stripped, every SQL statement is byte-identical to the repo.
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> New query -> paste this whole file
--    -> Run. It is wrapped in a single transaction: it all applies, or
--    nothing does.
--
--    Or from a terminal:
--      psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0216-0220.sql
--
--  IS IT SAFE
--    Yes. There is no DROP TABLE, no TRUNCATE, no DELETE anywhere in this file.
--    Every statement is additive and idempotent (IF NOT EXISTS / ON CONFLICT
--    DO NOTHING / NOT EXISTS), so running it twice changes nothing the second
--    time. No existing row is at risk.
--
--    Two sections DO write rows — 0217 (master data) and 0220 (backfill).
--    Both are called out below. Read them before running.
--
--  PREREQUISITES  (all already exist in production)
--    employees                   base schema
--    module_submissions          0063_form_modules.sql
--    product_options             0063_form_modules.sql
--    outstanding_products        0055_outstanding_rebuild.sql
--    outstanding_payment_modes   0055_outstanding_rebuild.sql
--    outstanding_entities        0055_outstanding_rebuild.sql
--
--  DO NOT run `npm run db:migrate` to achieve this. The drizzle journal is
--  stale at 0019, so that command would also apply two dozen unrelated
--  pending migrations.
-- ===========================================================================

BEGIN;

-- -------------------------------------------------------------------------
--  0216_module_submission_attachments.sql
--  Reimbursement receipts become files the firm holds (replaces the free-text bill_url Drive link).
--  STRUCTURE ONLY - creates 1 table + 1 index. No data written.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS module_submission_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES module_submissions (id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime          text,
  size_bytes    integer,
  uploaded_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_submission_attachments_submission_idx
  ON module_submission_attachments (submission_id, created_at);

-- -------------------------------------------------------------------------
--  0217_masters_payment_modes_and_products.sql
--  Master data: payment modes (IGV -> IJV + new accounts) and the product master gaining a code.
--  WRITES BUSINESS DATA - renames IGV to IJV, inserts 15 payment modes, 11 products, 7 product options. REVIEW THE VALUES.
-- -------------------------------------------------------------------------

UPDATE outstanding_payment_modes
   SET name = 'IJV', updated_at = now()
 WHERE name = 'IGV'
   AND NOT EXISTS (SELECT 1 FROM outstanding_payment_modes m WHERE m.name = 'IJV');
UPDATE outstanding_entities
   SET name = 'IJV', updated_at = now()
 WHERE name = 'IGV'
   AND NOT EXISTS (SELECT 1 FROM outstanding_entities e WHERE e.name = 'IJV');
INSERT INTO outstanding_payment_modes (name)
VALUES
  ('Razorpay'),
  ('Altus Kotak'),
  ('Unleashed Kotak'),
  ('KAS Kotak'),
  ('MJV HUF Kotak'),
  ('JSV HUF Kotak'),
  ('JSV HUF ICICI'),
  ('CMV G Pay'),
  ('MJV G Pay'),
  ('Pay U'),
  ('Jodo'),
  ('Parvez Kotak'),
  ('Dattaram Kotak'),
  ('Smita'),
  ('Sunil Kotak')
ON CONFLICT (name) DO NOTHING;
ALTER TABLE outstanding_products
  ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS outstanding_products_code_lower_idx
  ON outstanding_products (lower(code))
  WHERE code IS NOT NULL;
UPDATE outstanding_products
   SET code = name, updated_at = now()
 WHERE code IS NULL
   AND name ~ '^[A-Z][A-Z0-9]{1,7}$';
INSERT INTO outstanding_products (name, code)
VALUES
  ('BSS',               'BSS'),
  ('PS',                'PS'),
  ('Altus Conclave',    NULL),
  ('PSO',               'PSO'),
  ('BSSO',              'BSSO'),
  ('OS',                'OS'),
  ('Commission',        NULL),
  ('Rent',              NULL),
  ('Billing',           NULL),
  ('Retainer',          NULL),
  ('Graduate Programs', 'GP')
ON CONFLICT (name) DO NOTHING;
INSERT INTO product_options (label, sort_order)
VALUES
  ('Don''t Know',   10),
  ('Collaboration', 110),
  ('Key Note',      110),
  ('Inhouse PSO',   110),
  ('Being Arjun',   110),
  ('2 Days',        110),
  ('Consulting',    110)
ON CONFLICT (label) DO NOTHING;

-- -------------------------------------------------------------------------
--  0218_delegated_access.sql
--  Temporary delegated access. No credential is stored anywhere in these tables.
--  STRUCTURE ONLY - creates 2 tables + 6 indexes. No data written.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delegated_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  delegate_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  reason text,
  duration_minutes integer NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  first_used_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delegated_access_no_self CHECK (target_employee_id <> delegate_employee_id),
  CONSTRAINT delegated_access_duration_sane CHECK (duration_minutes > 0 AND duration_minutes <= 1440)
);
CREATE INDEX IF NOT EXISTS delegated_access_token_idx
  ON delegated_access_grants (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS delegated_access_one_live_per_delegate_idx
  ON delegated_access_grants (delegate_employee_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS delegated_access_target_idx
  ON delegated_access_grants (target_employee_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS delegated_access_delegate_idx
  ON delegated_access_grants (delegate_employee_id, starts_at DESC);
CREATE TABLE IF NOT EXISTS delegated_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES delegated_access_grants(id) ON DELETE SET NULL,
  /**
   * granted            — a manager created the grant
   * started            — the delegate activated it and first acted as the target
   * expired            — the first request refused because the clock ran out
   * revoked            — a manager ended it early
   * denied_after_expiry— a later request refused on an expired or revoked grant
   * denied             — a token that resolved to no usable grant at all
   */
  kind text NOT NULL,
  target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  delegate_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  detail text,
  device_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delegated_access_event_kind CHECK (
    kind IN ('granted', 'started', 'expired', 'revoked', 'denied_after_expiry', 'denied')
  )
);
CREATE INDEX IF NOT EXISTS delegated_access_events_grant_idx
  ON delegated_access_events (grant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS delegated_access_events_recent_idx
  ON delegated_access_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS delegated_access_events_target_idx
  ON delegated_access_events (target_employee_id, occurred_at DESC);

-- -------------------------------------------------------------------------
--  0219_permission_matrix.sql
--  Permission matrix: module -> sub-module -> sub-sub-module, SHOW/VIEW/EDIT per employee.
--  STRUCTURE ONLY - creates 2 tables + 4 indexes. Columns default to TRUE, so an absent row means full access; this grants nothing new by itself.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  can_show boolean NOT NULL DEFAULT true,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_permissions_employee_node_uniq UNIQUE (employee_id, node_key)
);
CREATE INDEX IF NOT EXISTS module_permissions_employee_idx
  ON module_permissions (employee_id);
CREATE INDEX IF NOT EXISTS module_permissions_node_idx
  ON module_permissions (node_key);
CREATE TABLE IF NOT EXISTS module_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  node_key text NOT NULL,
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

-- -------------------------------------------------------------------------
--  0220_manager_hierarchy_history.sql
--  Reporting-manager history. employees.manager_id stays canonical and is not touched.
--  WRITES DATA - backfills ONE ROW PER EMPLOYEE from employees.manager_id. Guarded by NOT EXISTS, so re-running is safe.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employee_manager_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  effective_from date NOT NULL,
  effective_to date,
  changed_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_manager_history_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT employee_manager_history_no_self CHECK (
    manager_id IS NULL OR manager_id <> employee_id
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_manager_history_one_open_idx
  ON employee_manager_history (employee_id)
  WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS employee_manager_history_lookup_idx
  ON employee_manager_history (employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS employee_manager_history_manager_idx
  ON employee_manager_history (manager_id, effective_from DESC);
INSERT INTO employee_manager_history (employee_id, manager_id, effective_from, note)
SELECT
  e.id,
  e.manager_id,
  COALESCE(e.joined_at::date, e.created_at::date, CURRENT_DATE),
  'Backfilled from employees.manager_id when reporting history was introduced (0220). The start date is the joining date, which is the earliest date this relationship can be asserted from — it is not evidence of when the reporting line actually began.'
FROM employees e
WHERE NOT EXISTS (
  SELECT 1
    FROM employee_manager_history h
   WHERE h.employee_id = e.id
     AND h.effective_to IS NULL
);

COMMIT;

-- ===========================================================================
--  VERIFY  (run after COMMIT — each should return one row)
-- ===========================================================================
-- SELECT to_regclass('module_submission_attachments') AS t_0216;
-- SELECT to_regclass('delegated_access_grants')       AS t_0218a;
-- SELECT to_regclass('delegated_access_events')       AS t_0218b;
-- SELECT to_regclass('module_permissions')            AS t_0219a;
-- SELECT to_regclass('module_permission_events')      AS t_0219b;
-- SELECT to_regclass('employee_manager_history')      AS t_0220;
--
-- 0217 landed?
-- SELECT count(*) FILTER (WHERE name = 'IJV') AS ijv_renamed,
--        count(*)                             AS payment_modes
--   FROM outstanding_payment_modes;
-- SELECT count(*) AS products_with_code FROM outstanding_products WHERE code IS NOT NULL;
--
-- 0220 backfill covered everyone?
-- SELECT (SELECT count(*) FROM employees)                                    AS employees,
--        (SELECT count(*) FROM employee_manager_history WHERE effective_to IS NULL) AS open_rows;
