-- ===========================================================================
--  RUN IN SUPABASE — migrations 0216 to 0224 (additive)
--  Altus WMS · branch `Om` · regenerated 2026-09-11
-- ===========================================================================
--
--  WHAT THIS IS
--    Every pending migration that is SAFE TO APPLY UNATTENDED, bundled in
--    filename order inside one transaction. Generated verbatim from
--    db/migrations/*.sql — every statement is byte-identical to the repo.
--
--  HOW TO RUN
--    Supabase Dashboard -> SQL Editor -> New query -> paste this file -> Run.
--    It is one transaction: it all applies, or nothing does.
--      or:  psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0216-0224.sql
--
--  IS IT SAFE
--    Yes. No DROP TABLE, no TRUNCATE, no DELETE anywhere in this file. Every
--    statement is additive and idempotent (IF NOT EXISTS / ON CONFLICT DO
--    NOTHING / NOT EXISTS), so a second run changes nothing.
--    (0224 contains DROP INDEX, which replaces an index and destroys no row.)
--
--    Two sections write ROWS — 0217 (master data) and 0220 (backfill). Both are
--    called out below and both are idempotent. Read them before running.
--
--  ⚠️  0223 IS NOT IN THIS FILE, DELIBERATELY.
--    db/migrations/0223_clear_registered_devices.sql DELETEs every row from
--    mobile_devices. It is a real decision with a real cost (device history is
--    lost), so it must not ride along inside a paste-and-go bundle. Run it on
--    its own, only when you mean to, and read its header first:
--
--      pnpm db:migrate -- --allow-destructive=0223_clear_registered_devices.sql
--
--    ORDER: 0222 and 0224 add the columns; 0223 clears the rows. Apply this
--    file FIRST, then decide about 0223.
--
--  PREREQUISITES (all already exist in production)
--    employees, mobile_devices, holidays, module_submissions, product_options,
--    outstanding_products, outstanding_payment_modes, outstanding_entities
--
--  DO NOT use `npm run db:migrate` to achieve this — the drizzle journal is
--  stale at 0019, so it would also apply two dozen unrelated pending files.
-- ===========================================================================

BEGIN;

-- -------------------------------------------------------------------------
--  0216_module_submission_attachments.sql
--  Reimbursement receipts become files the firm holds, replacing a free-text Drive link.
--  STRUCTURE ONLY — 1 table, 1 index.
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
--  Master data: payment modes (IGV to IJV, plus new accounts) and a product code.
--  WRITES BUSINESS DATA — renames IGV to IJV, inserts 15 payment modes, 11 products, 7 options. REVIEW THE VALUES.
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
--  Temporary delegated access. No credential is stored in these tables.
--  STRUCTURE ONLY — 2 tables, 6 indexes.
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
--  Permission matrix: module tree with SHOW/VIEW/EDIT per employee.
--  STRUCTURE ONLY — 2 tables, 4 indexes. Columns default TRUE, so this grants nothing new by itself.
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
--  Reporting-manager history. employees.manager_id stays canonical.
--  WRITES DATA — backfills one row per employee. Guarded by NOT EXISTS, safe to re-run.
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

-- -------------------------------------------------------------------------
--  0221_holiday_note.sql
--  An optional note on a holiday, and a record of who last changed it.
--  STRUCTURE ONLY — additive columns.
-- -------------------------------------------------------------------------

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- -------------------------------------------------------------------------
--  0222_device_registration_consent.sql
--  First-login device registration: registration columns + the consent audit table.
--  STRUCTURE ONLY — adds columns to mobile_devices, creates device_consent_events.
-- -------------------------------------------------------------------------

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS bios_serial_number text;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS manufacturer text;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_bios_serial_uq
  ON mobile_devices (lower(bios_serial_number))
  WHERE bios_serial_number IS NOT NULL AND kind = 'laptop';
UPDATE mobile_devices
   SET registered_at = COALESCE(approved_at, created_at, now())
 WHERE registered_at IS NULL;
CREATE TABLE IF NOT EXISTS device_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  device_row_id uuid REFERENCES mobile_devices (id) ON DELETE SET NULL,
  device_id text,
  consent_version text NOT NULL,
  consent_type text NOT NULL DEFAULT 'device-registration',
  actor_employee_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  consented_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_consent_events_employee_idx
  ON device_consent_events (employee_id, consented_at DESC);
CREATE INDEX IF NOT EXISTS device_consent_events_device_idx
  ON device_consent_events (device_row_id);
CREATE INDEX IF NOT EXISTS device_consent_events_version_idx
  ON device_consent_events (consent_version);

-- -------------------------------------------------------------------------
--  0224_device_name_replaces_bios_serial.sql
--  Renames the registration field to device_name. MUST run after 0222.
--  STRUCTURE ONLY — renames a column, swaps one index. wmic is absent on Windows 11 26100+, so the BIOS-serial ask was undoable for the roster.
-- -------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'mobile_devices' AND column_name = 'bios_serial_number'
     )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'mobile_devices' AND column_name = 'device_name'
     )
  THEN
    ALTER TABLE mobile_devices RENAME COLUMN bios_serial_number TO device_name;
  END IF;
END $$;
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS device_name text;
DROP INDEX IF EXISTS mobile_devices_bios_serial_uq;
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_name_uq
  ON mobile_devices (lower(device_name))
  WHERE device_name IS NOT NULL AND kind = 'laptop';

COMMIT;

-- ===========================================================================
--  VERIFY (run after COMMIT)
-- ===========================================================================
-- SELECT to_regclass('module_submission_attachments') AS t_0216,
--        to_regclass('delegated_access_grants')       AS t_0218,
--        to_regclass('module_permissions')            AS t_0219,
--        to_regclass('employee_manager_history')      AS t_0220,
--        to_regclass('device_consent_events')         AS t_0222;
--
-- 0224 landed? device_name should exist and bios_serial_number should NOT.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'mobile_devices'
--    AND column_name IN ('device_name','bios_serial_number','registered_at');
--
-- 0217 landed?
-- SELECT count(*) FILTER (WHERE name='IJV') AS ijv, count(*) AS modes
--   FROM outstanding_payment_modes;
