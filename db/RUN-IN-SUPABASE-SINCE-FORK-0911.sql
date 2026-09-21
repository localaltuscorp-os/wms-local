-- EVERY DATABASE CHANGE ON wms-local main SINCE THE FORK PUSH OF 11 SEP 2026.
-- 45 migrations, in filename order. Generated from git, comments removed
-- on purpose: the Supabase SQL editor misreads an apostrophe inside a comment.
--
-- EXCLUDED: 0223_clear_registered_devices.sql. It is DELETE FROM mobile_devices,
-- a one-time wipe of every registered device. Running it again would clear them
-- all. It was applied once, on 17 Sep, and must not be repeated.
--
-- PART 1 adds enum values. Postgres refuses to use a value added in the same
-- transaction, so run PART 1 first, on its own, then PART 2.
-- PART 2 is one transaction: if any statement fails, nothing changes.
-- Everything is idempotent - safe to run on a database that already has some.

-- ============================ PART 1 ============================

alter type approval_status add value if not exists 'on_hold';
alter type approval_status add value if not exists 'archived';

-- ============================ PART 2 ============================

BEGIN;

-- 0215_broadcast_popup_snooze.sql
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_session text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS popup_seen_at timestamptz;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS broadcast_recipient_popup_idx
  ON broadcast_recipients(employee_id, status, snoozed_at);

-- 0215_device_access_and_attendance_audit.sql
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoke_reason text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE mobile_devices m
   SET status = 'revoked',
       revoked_at = now(),
       revoke_reason = 'Superseded by the one-laptop-one-phone rule (migration 0215)'
 WHERE m.status = 'approved'
   AND m.id <> (
     SELECT k.id
       FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.kind = m.kind
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 1
   );

CREATE OR REPLACE FUNCTION mobile_devices_cap_approved() RETURNS trigger AS $fn$
DECLARE
  approved_same_kind int;
BEGIN
  
  
  
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  
  
  
  
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND OLD.employee_id = NEW.employee_id
     AND OLD.kind = NEW.kind THEN
    RETURN NEW;
  END IF;

  
  
  
  
  PERFORM pg_advisory_xact_lock(
    hashtext('mobile_devices_cap:' || NEW.employee_id::text || ':' || NEW.kind)
  );

  SELECT count(*) INTO approved_same_kind
    FROM mobile_devices
   WHERE employee_id = NEW.employee_id
     AND kind = NEW.kind
     AND status = 'approved'
     AND id <> NEW.id;

  IF approved_same_kind >= 1 THEN
    RAISE EXCEPTION 'mobile_devices_employee_approved_cap'
      USING HINT = 'This employee already has an approved device of this kind. Revoke it first.';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mobile_devices_cap_approved_trg ON mobile_devices;
CREATE TRIGGER mobile_devices_cap_approved_trg
  BEFORE INSERT OR UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION mobile_devices_cap_approved();

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_employee_kind_approved_uq
  ON mobile_devices (employee_id, kind)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS mobile_devices_employee_status_idx
  ON mobile_devices (employee_id, status);

CREATE TABLE IF NOT EXISTS attendance_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  
  
  
  
  
  attendance_log_id uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,

  
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  
  actor_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,

  
  action            text NOT NULL,           
  field             text,                    
  attendance_date   date NOT NULL,           
  punch_kind        text,                    
  old_value         text,                    
  new_value         text,                    
  reason            text,

  
  
  
  device_row_id     uuid REFERENCES mobile_devices(id) ON DELETE SET NULL,
  device_label      text,
  device_kind       text,

  
  
  
  
  authorization_context jsonb,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_audit_employee_date_idx
  ON attendance_audit_log (employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_actor_created_idx
  ON attendance_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_created_idx
  ON attendance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_action_idx
  ON attendance_audit_log (action);

CREATE OR REPLACE FUNCTION attendance_audit_log_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'attendance_audit_log is append-only'
    USING HINT = 'Attendance audit records cannot be modified or deleted. Record a corrective entry instead.';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_audit_log_no_update_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_update_trg
  BEFORE UPDATE ON attendance_audit_log
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_log_immutable();

DROP TRIGGER IF EXISTS attendance_audit_log_no_delete_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_delete_trg
  BEFORE DELETE ON attendance_audit_log
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_log_immutable();

DROP TRIGGER IF EXISTS attendance_audit_log_no_truncate_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_truncate_trg
  BEFORE TRUNCATE ON attendance_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_audit_log_immutable();

ALTER TABLE attendance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_audit_read_admin"   ON attendance_audit_log;
DROP POLICY IF EXISTS "attendance_audit_insert_actor" ON attendance_audit_log;

CREATE POLICY "attendance_audit_read_admin"
  ON attendance_audit_log FOR SELECT
  TO authenticated
  USING (app.is_admin());

CREATE POLICY "attendance_audit_insert_actor"
  ON attendance_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = app.current_employee_id());

REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM anon;

-- 0216_incentive_eligibility.sql
ALTER TABLE incentive_catalog
  ADD COLUMN IF NOT EXISTS applies_to_all boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS incentive_eligibility (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incentive_id uuid NOT NULL REFERENCES incentive_catalog(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id)         ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS incentive_eligibility_pair_uq
  ON incentive_eligibility (incentive_id, employee_id);

CREATE INDEX IF NOT EXISTS incentive_eligibility_employee_idx
  ON incentive_eligibility (employee_id);

-- 0216_module_submission_attachments.sql
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

-- 0217_masters_payment_modes_and_products.sql
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

-- 0218_delegated_access.sql
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

-- 0219_permission_matrix.sql
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

-- 0220_manager_hierarchy_history.sql
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

-- 0221_candidate_access_links.sql
CREATE TABLE IF NOT EXISTS candidate_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  
  
  intake_id uuid NOT NULL REFERENCES candidate_intake(id) ON DELETE CASCADE,

  
  
  token_hash text NOT NULL UNIQUE,

  expires_at timestamptz NOT NULL,
  
  revoked_at timestamptz,
  
  
  last_used_at timestamptz,

  
  
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidate_access_links_intake_idx
  ON candidate_access_links(intake_id, created_at DESC);

-- 0221_holiday_note.sql
ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- 0221_operations_checklist.sql
CREATE TABLE IF NOT EXISTS "ops_checklist_templates" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          text NOT NULL UNIQUE,
  
  
  
  "is_event"      boolean NOT NULL DEFAULT true,
  "description"   text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ops_checklist_templates_active_idx"
  ON "ops_checklist_templates" ("is_active", "name");

CREATE TABLE IF NOT EXISTS "ops_checklist_runs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  "template_id"   uuid REFERENCES "ops_checklist_templates"("id") ON DELETE SET NULL,
  "title"         text NOT NULL,
  "is_event"      boolean NOT NULL DEFAULT true,
  
  
  "event_id"      uuid REFERENCES "calendar_events"("id") ON DELETE SET NULL,
  
  "event_date"    date,
  "status"        text NOT NULL DEFAULT 'active',
  "notes"         text,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ops_checklist_runs_status_chk"
    CHECK ("status" IN ('active', 'completed', 'cancelled')),
  
  
  CONSTRAINT "ops_checklist_runs_event_date_chk"
    CHECK ("is_event" = false OR "event_date" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ops_checklist_runs_event_idx"
  ON "ops_checklist_runs" ("event_id");
CREATE INDEX IF NOT EXISTS "ops_checklist_runs_status_date_idx"
  ON "ops_checklist_runs" ("status", "event_date" DESC);

CREATE TABLE IF NOT EXISTS "ops_checklist_items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  
  "template_id"   uuid REFERENCES "ops_checklist_templates"("id") ON DELETE CASCADE,
  "run_id"        uuid REFERENCES "ops_checklist_runs"("id") ON DELETE CASCADE,

  "code"          text,
  "title"         text NOT NULL,                      
  "category"      text,

  
  
  
  
  "offset_days"   integer,
  
  
  "target_date"   date,

  "doer_id"       uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "backup_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,

  "instructions"  text,
  "file_link"     text,
  
  
  "jd_entry_id"   uuid,

  "sort_order"    integer NOT NULL DEFAULT 100,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "ops_checklist_items_parent_chk" CHECK (
    ("template_id" IS NOT NULL AND "run_id" IS NULL)
    OR
    ("template_id" IS NULL AND "run_id" IS NOT NULL)
  ),
  
  CONSTRAINT "ops_checklist_items_offset_chk"
    CHECK ("offset_days" IS NULL OR ("offset_days" BETWEEN -365 AND 365)),
  
  CONSTRAINT "ops_checklist_items_backup_chk"
    CHECK ("backup_id" IS NULL OR "backup_id" <> "doer_id")
);

CREATE INDEX IF NOT EXISTS "ops_checklist_items_template_idx"
  ON "ops_checklist_items" ("template_id", "sort_order");
CREATE INDEX IF NOT EXISTS "ops_checklist_items_run_idx"
  ON "ops_checklist_items" ("run_id", "offset_days", "sort_order");
CREATE INDEX IF NOT EXISTS "ops_checklist_items_doer_idx"
  ON "ops_checklist_items" ("doer_id");

CREATE TABLE IF NOT EXISTS "ops_checklist_checks" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id"        uuid NOT NULL REFERENCES "ops_checklist_runs"("id") ON DELETE CASCADE,
  "item_id"       uuid NOT NULL REFERENCES "ops_checklist_items"("id") ON DELETE CASCADE,
  "status"        text NOT NULL DEFAULT 'Pending',
  "notes"         text,
  
  
  
  "done_at"       timestamptz,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ops_checklist_checks_status_chk"
    CHECK ("status" IN ('Done', 'Pending', 'Need Help', 'Not Applicable'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ops_checklist_checks_uq"
  ON "ops_checklist_checks" ("run_id", "item_id");

CREATE INDEX IF NOT EXISTS "ops_checklist_checks_run_idx"
  ON "ops_checklist_checks" ("run_id");

-- 0222_candidate_policy_signing.sql
ALTER TABLE candidate_access_links
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'form';

CREATE TABLE IF NOT EXISTS candidate_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  
  
  intake_id uuid NOT NULL REFERENCES candidate_intake(id) ON DELETE CASCADE,

  
  
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  policy_key text NOT NULL,
  
  
  version integer NOT NULL DEFAULT 1,

  
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  
  CONSTRAINT candidate_policy_signature_uq UNIQUE (intake_id, policy_key)
);

CREATE INDEX IF NOT EXISTS candidate_policy_signatures_intake_idx
  ON candidate_policy_signatures(intake_id);

-- 0222_device_registration_consent.sql
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

-- 0222_job_description.sql
CREATE TABLE IF NOT EXISTS "jd_ranks" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL UNIQUE,
  
  "rank_order" integer NOT NULL UNIQUE,
  "band"       text,
  "is_active"  boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "jd_ranks" ("name", "rank_order", "band") VALUES
  ('Intern (2nd Yr)',   10,  'Trainee'),
  ('Intern (3rd Yr)',   20,  'Trainee'),
  ('Executive',         30,  'Individual'),
  ('Sr. Executive',     40,  'Individual'),
  ('Consultant',        50,  'Individual'),
  ('Assistant Manager', 60,  'Management'),
  ('Deputy Manager',    70,  'Management'),
  ('Manager',           80,  'Management'),
  ('Sr. Manager',       90,  'Management'),
  ('DGM',               100, 'Senior'),
  ('GM',                110, 'Senior'),
  ('AVP',               120, 'Executive'),
  ('VP',                130, 'Executive'),
  ('President',         140, 'Executive')
ON CONFLICT ("name") DO NOTHING;

CREATE TABLE IF NOT EXISTS "jd_positions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  
  "function_key"  text NOT NULL,
  "rank_id"       uuid NOT NULL REFERENCES "jd_ranks"("id") ON DELETE RESTRICT,
  
  
  "variant"       text,
  "title"         text NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_positions_function_chk" CHECK ("function_key" IN
    ('sales','marketing','operations','handholding','hr','admin','accounts','apps'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "jd_positions_uq"
  ON "jd_positions" ("function_key", "rank_id", COALESCE("variant", ''));

CREATE INDEX IF NOT EXISTS "jd_positions_active_idx"
  ON "jd_positions" ("is_active", "function_key");

CREATE SEQUENCE IF NOT EXISTS "jd_entries_serial_seq" START 1;

CREATE TABLE IF NOT EXISTS "jd_entries" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serial_no"         text NOT NULL UNIQUE
                        DEFAULT ('JD-' || lpad(nextval('jd_entries_serial_seq')::text, 4, '0')),
  "position_id"       uuid NOT NULL REFERENCES "jd_positions"("id") ON DELETE RESTRICT,
  
  
  "function_key"      text NOT NULL,
  "task"              text NOT NULL,
  "notes_html"        text,
  
  
  
  "recurrence"        jsonb NOT NULL DEFAULT '{"kind":"daily"}'::jsonb,
  "estimated_minutes" integer NOT NULL DEFAULT 15,
  "video_url"         text,
  "guidelines_url"    text,
  "template_url"      text,
  
  "push_dcc"          boolean NOT NULL DEFAULT false,
  "push_wms"          boolean NOT NULL DEFAULT false,
  "push_event"        boolean NOT NULL DEFAULT false,
  "is_active"         boolean NOT NULL DEFAULT true,
  "created_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT "jd_entries_minutes_chk"
    CHECK ("estimated_minutes" BETWEEN 1 AND 960),
  CONSTRAINT "jd_entries_task_chk"
    CHECK (length(btrim("task")) > 0)
);

CREATE INDEX IF NOT EXISTS "jd_entries_position_idx"
  ON "jd_entries" ("position_id", "is_active");
CREATE INDEX IF NOT EXISTS "jd_entries_function_idx"
  ON "jd_entries" ("function_key", "is_active");

CREATE TABLE IF NOT EXISTS "jd_attachments" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"         uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  
  
  
  "kind"          text NOT NULL,
  "storage_path"  text NOT NULL,
  "file_name"     text NOT NULL,
  "mime"          text,
  "size_bytes"    integer,
  "uploaded_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_attachments_kind_chk"
    CHECK ("kind" IN ('video', 'guidelines', 'template'))
);

CREATE INDEX IF NOT EXISTS "jd_attachments_jd_idx"
  ON "jd_attachments" ("jd_id", "created_at");

CREATE TABLE IF NOT EXISTS "jd_assignments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"          uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  "employee_id"    uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  
  
  "source"         text NOT NULL DEFAULT 'position',
  "assigned_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to"   date,
  "is_active"      boolean NOT NULL DEFAULT true,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_assignments_source_chk"
    CHECK ("source" IN ('position', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "jd_assignments_active_uq"
  ON "jd_assignments" ("jd_id", "employee_id") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "jd_assignments_employee_idx"
  ON "jd_assignments" ("employee_id", "is_active");

CREATE TABLE IF NOT EXISTS "jd_delegations" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"             uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  "from_employee_id"  uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "to_employee_id"    uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  
  "leave_request_id"  uuid REFERENCES "leave_requests"("id") ON DELETE SET NULL,
  "start_date"        date NOT NULL,
  "end_date"          date NOT NULL,
  "status"            text NOT NULL DEFAULT 'active',
  "acknowledged_at"   timestamptz,
  "created_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_delegations_status_chk"
    CHECK ("status" IN ('active', 'completed', 'revoked')),
  CONSTRAINT "jd_delegations_people_chk"
    CHECK ("from_employee_id" <> "to_employee_id"),
  CONSTRAINT "jd_delegations_dates_chk"
    CHECK ("end_date" >= "start_date")
);

CREATE INDEX IF NOT EXISTS "jd_delegations_to_idx"
  ON "jd_delegations" ("to_employee_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "jd_delegations_from_idx"
  ON "jd_delegations" ("from_employee_id", "status", "start_date");

CREATE TABLE IF NOT EXISTS "jd_push_log" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"       uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  "target"      text NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  
  
  "period_key"  text NOT NULL,
  
  "external_id" uuid,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_push_log_target_chk"
    CHECK ("target" IN ('dcc', 'wms', 'event'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "jd_push_log_uq"
  ON "jd_push_log" ("jd_id", "target", "employee_id", "period_key");

CREATE TABLE IF NOT EXISTS "jd_position_holders" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "position_id"   uuid NOT NULL REFERENCES "jd_positions"("id") ON DELETE CASCADE,
  "employee_id"   uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "jd_position_holders_active_uq"
  ON "jd_position_holders" ("employee_id") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "jd_position_holders_position_idx"
  ON "jd_position_holders" ("position_id", "is_active");

-- 0224_device_name_replaces_bios_serial.sql
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

-- 0225_candidate_policy_signature_image.sql
ALTER TABLE candidate_policy_signatures
  ADD COLUMN IF NOT EXISTS signature_path text;

-- 0225_employee_master.sql
CREATE TABLE IF NOT EXISTS functions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS functions_name_uq ON functions (lower(name));
CREATE INDEX IF NOT EXISTS functions_active_idx ON functions (is_active, sort_order);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS function_id uuid REFERENCES functions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_function_idx ON employees (function_id);

CREATE TABLE IF NOT EXISTS shift_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shift_types_name_uq ON shift_types (lower(name));
CREATE INDEX IF NOT EXISTS shift_types_active_idx ON shift_types (is_active, sort_order);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS shift_type_id uuid REFERENCES shift_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_shift_type_idx ON employees (shift_type_id);

INSERT INTO shift_types (name, sort_order) VALUES
  ('General', 10),
  ('First Half', 20),
  ('Second Half', 30),
  ('Night', 40),
  ('Flexible', 50)
ON CONFLICT DO NOTHING;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_team_lead boolean NOT NULL DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS train_pass boolean NOT NULL DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_code text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_uq
  ON employees (lower(employee_code))
  WHERE employee_code IS NOT NULL;

ALTER TABLE paying_entities
  ADD COLUMN IF NOT EXISTS code_prefix text;

CREATE UNIQUE INDEX IF NOT EXISTS paying_entities_code_prefix_uq
  ON paying_entities (upper(code_prefix))
  WHERE code_prefix IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_code_registry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  code         text NOT NULL,
  
  prefix       text NOT NULL,
  seq          integer NOT NULL,
  
  
  
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  
  employee_name text,
  status       text NOT NULL DEFAULT 'active',   
  issued_at    timestamptz NOT NULL DEFAULT now(),
  issued_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  retired_at   timestamptz,
  retired_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  retired_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_code_registry_code_uq
  ON employee_code_registry (upper(code));

CREATE UNIQUE INDEX IF NOT EXISTS employee_code_registry_prefix_seq_uq
  ON employee_code_registry (upper(prefix), seq);

CREATE INDEX IF NOT EXISTS employee_code_registry_employee_idx
  ON employee_code_registry (employee_id);

CREATE INDEX IF NOT EXISTS employee_code_registry_status_idx
  ON employee_code_registry (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_code_registry_status_chk') THEN
    ALTER TABLE employee_code_registry
      ADD CONSTRAINT employee_code_registry_status_chk CHECK (status IN ('active', 'retired'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_code_registry_one_active_uq
  ON employee_code_registry (employee_id)
  WHERE status = 'active' AND employee_id IS NOT NULL;

-- 0225_hr_records_drive.sql
CREATE TABLE IF NOT EXISTS hr_records_drive_settings (
  id integer PRIMARY KEY DEFAULT 1,
  
  account_email text,
  
  refresh_token_enc text,
  connected_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  connected_at timestamptz,

  
  schedule_enabled boolean NOT NULL DEFAULT false,
  interval_months integer NOT NULL DEFAULT 1,
  day_of_month integer NOT NULL DEFAULT 1,

  
  
  run_cursor text,
  last_run_started_at timestamptz,
  last_completed_at timestamptz,
  last_run_summary jsonb,
  last_error text,
  
  
  
  lock_until timestamptz,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_records_drive_settings_singleton CHECK (id = 1),
  CONSTRAINT hr_records_drive_settings_interval_chk CHECK (interval_months BETWEEN 1 AND 12),
  
  CONSTRAINT hr_records_drive_settings_day_chk CHECK (day_of_month BETWEEN 1 AND 28)
);

INSERT INTO hr_records_drive_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_records_drive_items (
  
  
  key text PRIMARY KEY,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  drive_id text NOT NULL,
  
  version text,
  
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_records_drive_items_employee_idx
  ON hr_records_drive_items (employee_id);

ALTER TABLE hr_records_drive_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_records_drive_items ENABLE ROW LEVEL SECURITY;

-- 0225_jd_assignment_targets.sql
alter table jd_assignments
  add column if not exists for_dcc   boolean not null default false,
  add column if not exists for_wms   boolean not null default false,
  add column if not exists for_event boolean not null default false;

update jd_assignments a
   set for_dcc   = e.push_dcc,
       for_wms   = e.push_wms,
       for_event = e.push_event
  from jd_entries e
 where e.id = a.jd_id
   and a.for_dcc = false
   and a.for_wms = false
   and a.for_event = false;

create index if not exists jd_assignments_target_idx
  on jd_assignments (jd_id, is_active, for_dcc, for_wms, for_event);

-- 0226_billing_master.sql
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS proprietor_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS proprietor_designation text;

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS cell_no text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS pan_no text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS gst_no text;

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS sac_codes text[] NOT NULL DEFAULT '{}';

ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS ifsc text;
ALTER TABLE paying_entities ADD COLUMN IF NOT EXISTS branch text;

ALTER TABLE paying_entities
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS billing_entity_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  
  
  
  
  entity_id uuid NOT NULL REFERENCES paying_entities(id) ON DELETE CASCADE,

  
  
  
  
  
  kind text NOT NULL,

  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,

  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_entity_files DROP CONSTRAINT IF EXISTS billing_entity_files_kind_chk;
ALTER TABLE billing_entity_files
  ADD CONSTRAINT billing_entity_files_kind_chk
  CHECK (kind IN ('logo', 'signature', 'document'));

CREATE UNIQUE INDEX IF NOT EXISTS billing_entity_files_one_per_role_idx
  ON billing_entity_files (entity_id, kind)
  WHERE kind IN ('logo', 'signature');

CREATE INDEX IF NOT EXISTS billing_entity_files_entity_idx
  ON billing_entity_files (entity_id, kind, created_at);

CREATE TABLE IF NOT EXISTS billing_entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  
  
  
  entity_id uuid NOT NULL,

  
  entity_name text NOT NULL,

  
  
  
  
  snapshot jsonb NOT NULL,

  
  reason text NOT NULL,

  actor_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_entity_versions_entity_created_idx
  ON billing_entity_versions (entity_id, created_at DESC);

-- 0226_employee_policy_typed_signatures.sql
CREATE TABLE IF NOT EXISTS employee_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  
  version integer NOT NULL DEFAULT 1,
  
  signed_name text NOT NULL,
  
  signature_path text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_policy_signature_uq UNIQUE (employee_id, policy_key)
);

CREATE INDEX IF NOT EXISTS employee_policy_signatures_employee_idx
  ON employee_policy_signatures (employee_id);

-- 0226_jd_rank_ladder_26.sql
do $ladder$
begin
  if exists (select 1 from jd_ranks where name = 'Chairman' and rank_order = 260) then
    raise notice '0226: the 26-rank ladder is already in place; nothing to do.';
    return;
  end if;

  update jd_ranks set rank_order = rank_order + 10000 where rank_order < 10000;

  insert into jd_ranks (name, rank_order, band, is_active) values
    ('Intern - First Year',         10,  'Trainee',            true),
    ('Intern - Second Year',        20,  'Trainee',            true),
    ('Intern - Third Year',         30,  'Trainee',            true),
    ('Executive',                   40,  'Individual',         true),
    ('Sr. Executive',               50,  'Individual',         true),
    ('Consultant',                  60,  'Individual',         true),
    ('Sr. Consultant',              70,  'Individual',         true),
    ('Assistant Manager',           80,  'Management',         true),
    ('Deputy Manager',              90,  'Management',         true),
    ('Manager',                     100, 'Management',         true),
    ('Associate Vice President',    110, 'Leadership',         true),
    ('Deputy Vice President',       120, 'Leadership',         true),
    ('Vice President',              130, 'Leadership',         true),
    ('Senior Vice President',       140, 'Leadership',         true),
    ('President',                   150, 'Leadership',         true),
    ('Sr President',                160, 'Leadership',         true),
    ('Assistant General Manager',   170, 'General Management', true),
    ('General Manager',             180, 'General Management', true),
    ('Sr. General Manager',         190, 'General Management', true),
    ('Associate Director',          200, 'Director',           true),
    ('Deputy Director',             210, 'Director',           true),
    ('Director',                    220, 'Director',           true),
    ('Senior Director',             230, 'Director',           true),
    ('CEO',                         240, 'Board',              true),
    ('Managing Director',           250, 'Board',              true),
    ('Chairman',                    260, 'Board',              true)
  on conflict (name) do update
    set rank_order = excluded.rank_order,
        band       = excluded.band,
        is_active  = true,
        updated_at = now();
end
$ladder$;

update jd_ranks r set is_active = false
 where r.rank_order >= 10000
   and r.name in ('Intern (2nd Yr)', 'Intern (3rd Yr)');

do $$
declare
  stranded int;
begin
  select count(*) into stranded
    from jd_positions p
    join jd_ranks r on r.id = p.rank_id
   where r.rank_order >= 10000 and r.is_active;

  if stranded > 0 then
    raise notice 'Migration 0226: % position(s) still sit on a rank outside the new ladder (DGM or similar). Re-point them by hand — they will escalate above every new rank until you do.', stranded;
  end if;
end $$;

-- 0227_entity_code_prefixes.sql
UPDATE paying_entities SET code_prefix = 'A'
 WHERE name = 'Altus Corp' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'U'
 WHERE name = 'Unleashed' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'K'
 WHERE name = 'Khushboo' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'M'
 WHERE name = 'The Gainmakers (MJV HUF)' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'J'
 WHERE name = 'Legacy Creators (JSV HUF)' AND code_prefix IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS paying_entities_code_prefix_uq
  ON paying_entities (upper(code_prefix))
  WHERE code_prefix IS NOT NULL;

ALTER TABLE paying_entities DROP CONSTRAINT IF EXISTS paying_entities_code_prefix_chk;
ALTER TABLE paying_entities
  ADD CONSTRAINT paying_entities_code_prefix_chk
  CHECK (code_prefix IS NULL OR code_prefix ~ '^[A-Za-z]$');

-- 0228_employee_schedule_settings.sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS attendance_applicable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.attendance_applicable IS
  'FALSE = not required to punch; absence never counts against attendance or salary.';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sat1_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat2_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat3_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat4_working boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sat5_working boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.sat1_working IS
  'Is the 1st Saturday of the month a working day for this employee?';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sat_official_start time,
  ADD COLUMN IF NOT EXISTS sat_official_end   time;

COMMENT ON COLUMN employees.sat_official_start IS
  'Saturday start. NULL = same as the Mon-Fri att_official_start.';
COMMENT ON COLUMN employees.sat_official_end IS
  'Saturday end. NULL = same as the Mon-Fri att_official_end.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_sat_hours_ordered'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_sat_hours_ordered
      CHECK (
        sat_official_start IS NULL
        OR sat_official_end IS NULL
        OR sat_official_start < sat_official_end
      );
  END IF;
END $$;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS wfh_full_time_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wfh_part_time_allowed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.wfh_full_time_allowed IS
  'May work from home full time.';
COMMENT ON COLUMN employees.wfh_part_time_allowed IS
  'May work from home part of the week.';

-- 0228_jd_entries_category.sql
alter table jd_entries add column if not exists category text;

-- 0229_dcc_calendar_events.sql
create table if not exists dcc_calendar_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  event_date date not null,
  google_event_id text,
  synced_hash text,
  snapshot_at timestamptz,
  synced_at timestamptz,
  last_error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_calendar_events_uq
  on dcc_calendar_events (employee_id, event_date);

-- 0229_incentive_request_split.sql
ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS split jsonb;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_split_shape_chk;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_split_shape_chk CHECK (
    split IS NULL
    OR CASE
         WHEN jsonb_typeof(split) = 'array' THEN jsonb_array_length(split) BETWEEN 2 AND 5
         ELSE false
       END
  );

-- 0230_dcc_master_items.sql
create table if not exists dcc_master_items (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references designations(id) on delete cascade,
  section text,
  code text,
  title text not null,
  frequency text,
  target_number numeric(14, 2),
  unit text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dcc_master_items_designation_idx
  on dcc_master_items (designation_id, is_active, sort_order);

create table if not exists dcc_master_links (
  item_id uuid primary key references dcc_kpi_items(id) on delete cascade,
  master_item_id uuid not null references dcc_master_items(id) on delete cascade,
  owner_employee_id uuid not null references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists dcc_master_links_owner_master_uq
  on dcc_master_links (owner_employee_id, master_item_id);

-- 0230_incentive_approval_workflow.sql
ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_status_check;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  );

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS submission_no integer NOT NULL DEFAULT 1;

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS resubmitted_at timestamptz;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_submission_no_chk;

ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_submission_no_chk CHECK (submission_no >= 1);

CREATE TABLE IF NOT EXISTS incentive_request_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES incentive_requests (id) ON DELETE CASCADE,
  submission_no   integer NOT NULL,
  type            text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  split           jsonb,
  
  justification   text,
  submitted_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_request_submissions_no_chk CHECK (submission_no >= 1),
  
  
  CONSTRAINT incentive_request_submissions_justification_chk CHECK (
    submission_no = 1 OR (justification IS NOT NULL AND length(btrim(justification)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS incentive_request_submissions_request_no_uq
  ON incentive_request_submissions (request_id, submission_no);

CREATE TABLE IF NOT EXISTS incentive_request_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES incentive_requests (id) ON DELETE CASCADE,
  
  
  employee_id     uuid REFERENCES employees (id) ON DELETE SET NULL,
  submission_no   integer NOT NULL,
  previous_status text NOT NULL,
  new_status      text NOT NULL,
  action          text NOT NULL,
  reviewer_id     uuid REFERENCES employees (id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_request_decisions_action_chk CHECK (
    action IN ('approve', 'not_approve', 'due', 'not_due', 'reverse', 'publish', 'revise', 'legacy')
  ),
  CONSTRAINT incentive_request_decisions_prev_status_chk CHECK (
    previous_status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  ),
  CONSTRAINT incentive_request_decisions_new_status_chk CHECK (
    new_status IN ('pending', 'approved', 'rejected', 'due', 'not_due', 'reversed', 'revision_requested')
  ),
  
  
  CONSTRAINT incentive_request_decisions_note_chk CHECK (
    action NOT IN ('not_approve', 'reverse', 'revise')
    OR (note IS NOT NULL AND length(btrim(note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS incentive_request_decisions_request_idx
  ON incentive_request_decisions (request_id, created_at);

CREATE OR REPLACE FUNCTION incentive_history_is_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is an audit trail — rows cannot be edited, only added.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS incentive_request_submissions_immutable ON incentive_request_submissions;
CREATE TRIGGER incentive_request_submissions_immutable
  BEFORE UPDATE ON incentive_request_submissions
  FOR EACH ROW EXECUTE FUNCTION incentive_history_is_immutable();

DROP TRIGGER IF EXISTS incentive_request_decisions_immutable ON incentive_request_decisions;
CREATE TRIGGER incentive_request_decisions_immutable
  BEFORE UPDATE ON incentive_request_decisions
  FOR EACH ROW EXECUTE FUNCTION incentive_history_is_immutable();

INSERT INTO incentive_request_submissions
  (request_id, submission_no, type, details, split, submitted_by_id, submitted_at)
SELECT r.id, 1, r.type, r.details, r.split, r.employee_id, r.created_at
  FROM incentive_requests r
 WHERE NOT EXISTS (
   SELECT 1 FROM incentive_request_submissions s WHERE s.request_id = r.id
 );

INSERT INTO incentive_request_decisions
  (request_id, employee_id, submission_no, previous_status, new_status, action, reviewer_id, note, created_at)
SELECT r.id, r.employee_id, r.submission_no, 'pending', r.status, 'legacy',
       r.decided_by_id, r.decision_note, r.decided_at
  FROM incentive_requests r
 WHERE r.decided_at IS NOT NULL
   AND r.status IN ('approved', 'rejected')
   AND NOT EXISTS (
     SELECT 1 FROM incentive_request_decisions d WHERE d.request_id = r.id
   );

-- 0231_approver_initiator_status.sql
create table if not exists goal_approver_statuses (
  goal_id uuid primary key references goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists weekly_goal_approver_statuses (
  weekly_goal_id uuid primary key references weekly_goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 0231_incentive_notifications.sql
create table if not exists incentive_catalog_events (
  id           uuid primary key default gen_random_uuid(),
  catalog_id   uuid,
  catalog_name text not null,
  event_type   text not null,
  before       jsonb,
  after        jsonb,
  changes      jsonb not null default '[]'::jsonb,
  actor_id     uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint incentive_catalog_events_type_chk
    check (event_type in ('created', 'updated', 'deleted')),
  constraint incentive_catalog_events_snapshot_chk check (
    (event_type = 'created' and after is not null)
    or (event_type = 'updated' and before is not null and after is not null)
    or (event_type = 'deleted' and before is not null)
  )
);

create index if not exists incentive_catalog_events_catalog_idx
  on incentive_catalog_events (catalog_id, created_at);

create or replace function incentive_catalog_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'incentive_catalog_events is append-only';
end;
$$;

drop trigger if exists incentive_catalog_events_no_update on incentive_catalog_events;
create trigger incentive_catalog_events_no_update
  before update on incentive_catalog_events
  for each row execute function incentive_catalog_events_immutable();

create table if not exists incentive_notification_deliveries (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  subject_id   uuid not null,
  recipient_id uuid not null references employees(id) on delete cascade,
  version_key  text not null,
  created_at   timestamptz not null default now()
);

create unique index if not exists incentive_notification_deliveries_uq
  on incentive_notification_deliveries (event_type, subject_id, recipient_id, version_key);

create index if not exists incentive_notification_deliveries_recipient_idx
  on incentive_notification_deliveries (recipient_id, created_at);

-- 0232_incentive_master.sql
alter table incentive_catalog
  
  
  
  add column if not exists incentive_type text,
  
  
  
  
  add column if not exists product_id uuid references outstanding_products(id) on delete set null,
  
  add column if not exists duration text not null default 'permanent',
  
  
  
  add column if not exists valid_until date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_duration_chk'
  ) then
    alter table incentive_catalog
      add constraint incentive_catalog_duration_chk
      check (duration in ('permanent', 'one_time'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_type_chk'
  ) then
    
    alter table incentive_catalog
      add constraint incentive_catalog_type_chk
      check (
        incentive_type is null
        or incentive_type in (
          'bss_conversion', 'sales_pitch', 'client_happiness',
          'group_intro', 'leads_referrals'
        )
      );
  end if;
end $$;

create index if not exists incentive_catalog_active_name_idx
  on incentive_catalog (active, name);

alter table incentive_catalog_events
  add column if not exists effective_date date;

-- 0232_recruitment_jds.sql
create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null unique references interview_positions(id) on delete restrict,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);

-- 0233_jd_person_specific.sql
alter table jd_entries alter column position_id drop not null;

alter table jd_entries
  add column if not exists owner_employee_id uuid references employees(id) on delete cascade;

alter table jd_entries drop constraint if exists jd_entries_owner_chk;
alter table jd_entries
  add constraint jd_entries_owner_chk check ((position_id is null) <> (owner_employee_id is null));

create index if not exists jd_entries_owner_employee_idx on jd_entries (owner_employee_id, is_active);

-- 0234_functions_replace_departments.sql
insert into functions (id, name, is_active, sort_order, created_at, updated_at)
select d.id, d.name, d.is_active, d.sort_order, d.created_at, d.updated_at
from departments d
on conflict (id) do nothing;

update employees e
set department_id = f.id
from functions f
where e.department_id is not null
  and not exists (select 1 from functions x where x.id = e.department_id)
  and e.department is not null
  and lower(btrim(e.department)) = lower(f.name);

update employees
set department_id = null
where department_id is not null
  and not exists (select 1 from functions f where f.id = employees.department_id);

delete from employee_departments ed
where not exists (select 1 from functions f where f.id = ed.department_id);

alter table employees
  drop constraint if exists employees_department_id_fkey;
alter table employees
  add constraint employees_department_id_fkey
  foreign key (department_id) references functions(id) on delete set null;

alter table employee_departments
  drop constraint if exists employee_departments_department_id_fkey;
alter table employee_departments
  add constraint employee_departments_department_id_fkey
  foreign key (department_id) references functions(id) on delete cascade;

alter table jd_positions
  drop constraint if exists jd_positions_department_id_fkey;
alter table jd_positions
  add constraint jd_positions_department_id_fkey
  foreign key (department_id) references functions(id) on delete set null;

create unique index if not exists functions_name_uq on functions (lower(name));

create index if not exists functions_active_idx on functions (is_active, sort_order);

-- 0234_initiator_status_archived.sql
do $$
begin
  if to_regclass('public.goal_approver_statuses') is not null then
    alter table goal_approver_statuses
      drop constraint if exists goal_approver_statuses_approval_status_check;
    alter table goal_approver_statuses
      add constraint goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;

  if to_regclass('public.weekly_goal_approver_statuses') is not null then
    alter table weekly_goal_approver_statuses
      drop constraint if exists weekly_goal_approver_statuses_approval_status_check;
    alter table weekly_goal_approver_statuses
      add constraint weekly_goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.project_nodes') is not null then
    alter table project_nodes
      drop constraint if exists project_nodes_approval_status_check;
    alter table project_nodes
      add constraint project_nodes_approval_status_check
      check (
        approval_status is null
        or approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled')
      ) not valid;
  end if;
end $$;

-- 0235_dcc_call_logs.sql
create table if not exists dcc_call_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  log_date date not null,
  disposition text not null,
  
  
  count integer not null default 0 check (count >= 0),
  note text,
  filled_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_call_logs_uq
  on dcc_call_logs (employee_id, log_date, disposition);

create index if not exists dcc_call_logs_date_idx
  on dcc_call_logs (log_date, employee_id);

-- 0236_recruitment_jd_roles.sql
create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references interview_positions(id) on delete set null,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recruitment_jds add column if not exists slug text;
alter table recruitment_jds add column if not exists title text;
alter table recruitment_jds add column if not exists sort_order integer not null default 100;
alter table recruitment_jds add column if not exists is_active boolean not null default true;

alter table recruitment_jds alter column position_id drop not null;
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'recruitment_jds' and con.contype = 'u'
       and pg_get_constraintdef(con.oid) like '%(position_id)%'
  loop
    execute format('alter table recruitment_jds drop constraint %I', c);
  end loop;
end $$;

update recruitment_jds jd
   set slug = coalesce(jd.slug, 'position-' || replace(jd.id::text, '-', '')),
       title = coalesce(jd.title, p.label, 'Untitled role')
  from interview_positions p
 where p.id = jd.position_id and (jd.slug is null or jd.title is null);
update recruitment_jds
   set slug = coalesce(slug, 'position-' || replace(id::text, '-', '')),
       title = coalesce(title, 'Untitled role')
 where slug is null or title is null;

alter table recruitment_jds alter column slug set not null;
alter table recruitment_jds alter column title set not null;

create unique index if not exists recruitment_jds_slug_uq on recruitment_jds (slug);
create index if not exists recruitment_jds_order_idx on recruitment_jds (sort_order, title);

create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);

-- 0237_account_lockouts.sql
CREATE TABLE IF NOT EXISTS account_lockouts (
  
  
  
  email           text PRIMARY KEY,

  
  
  failed_count    integer NOT NULL DEFAULT 0,

  
  
  last_failed_at  timestamptz,

  
  
  locked_at       timestamptz,

  
  
  
  unlocked_at     timestamptz,
  unlocked_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,

  
  
  employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_lockouts DROP CONSTRAINT IF EXISTS account_lockouts_count_nonneg;
ALTER TABLE account_lockouts ADD CONSTRAINT account_lockouts_count_nonneg
  CHECK (failed_count >= 0);

CREATE INDEX IF NOT EXISTS account_lockouts_locked_idx
  ON account_lockouts (locked_at DESC)
  WHERE locked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_lockouts_employee_idx
  ON account_lockouts (employee_id)
  WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS login_attempt_ips (
  ip              text NOT NULL,
  window_start    timestamptz NOT NULL DEFAULT now(),
  failed_count    integer NOT NULL DEFAULT 0,
  last_failed_at  timestamptz,
  PRIMARY KEY (ip, window_start)
);

CREATE INDEX IF NOT EXISTS login_attempt_ips_window_idx
  ON login_attempt_ips (window_start);

CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0237_account_lockouts.sql')
ON CONFLICT DO NOTHING;

-- 0237_checklist_wms_columns_jd_client.sql
alter table ops_checklist_items add column if not exists client text;
alter table ops_checklist_items add column if not exists initiator_id uuid
  references employees(id) on delete set null;

alter table ops_checklist_items add column if not exists recurrence_rule text;

update ops_checklist_items
   set initiator_id = created_by_id
 where initiator_id is null and created_by_id is not null;

alter table ops_checklist_checks add column if not exists approver_status text;
alter table ops_checklist_checks add column if not exists approver_notes text;
alter table ops_checklist_checks add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table ops_checklist_checks add column if not exists approver_at timestamptz;

alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_approver_chk;
alter table ops_checklist_checks add constraint ops_checklist_checks_approver_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_status_chk;

update ops_checklist_checks
   set approver_status = coalesce(approver_status, 'cancelled'),
       status = 'not_started'
 where status = 'Not Applicable';

update ops_checklist_checks
   set status = case status
                  when 'Pending' then 'not_started'
                  when 'Done' then 'done'
                  when 'Need Help' then 'need_info'
                end
 where status in ('Pending', 'Done', 'Need Help');

alter table ops_checklist_checks alter column status set default 'not_started';
alter table ops_checklist_checks add constraint ops_checklist_checks_status_chk
  check (status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

alter table jd_entries add column if not exists client text;

create table if not exists jd_doer_notes (
  jd_id uuid not null references jd_entries(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  notes text,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (jd_id, employee_id)
);

create index if not exists jd_doer_notes_employee_idx on jd_doer_notes (employee_id);

-- 0238_security_role_grants.sql
CREATE TABLE IF NOT EXISTS security_role_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  
  
  role          text NOT NULL,
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_role_grants_employee_role_uniq UNIQUE (employee_id, role)
);

CREATE INDEX IF NOT EXISTS security_role_grants_role_idx
  ON security_role_grants (role);

CREATE TABLE IF NOT EXISTS security_role_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  role          text NOT NULL,
  
  action        text NOT NULL,
  actor_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_role_events_action_chk CHECK (action IN ('granted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS security_role_events_role_idx
  ON security_role_events (role, occurred_at DESC);

INSERT INTO security_role_grants (employee_id, role)
SELECT e.id, 'account_unlock'
  FROM employees e
 WHERE lower(e.email) IN (
         'mohitgupta.altuscorp@gmail.com',
         'rohanchoudhary.altuscorp@gmail.com',
         'jeevanbharambe.altuscorp@gmail.com',
         'manan@unleashed.in'
       )
ON CONFLICT (employee_id, role) DO NOTHING;

ALTER TABLE security_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_events ENABLE ROW LEVEL SECURITY;

-- 0238_wcc_mcc.sql
alter table dcc_kpi_items add column if not exists month_day smallint;
alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_month_day_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_month_day_chk
  check (month_day is null or month_day between 1 and 31);

alter table dcc_entries add column if not exists doer_status text;
alter table dcc_entries add column if not exists done_at timestamptz;
alter table dcc_entries add column if not exists approver_status text;
alter table dcc_entries add column if not exists approver_notes text;
alter table dcc_entries add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table dcc_entries add column if not exists approver_at timestamptz;

alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

alter table dcc_entries drop constraint if exists dcc_entries_approver_status_chk;
alter table dcc_entries add constraint dcc_entries_approver_status_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

update dcc_entries
   set doer_status = case status
                       when 'Done' then 'done'
                       when 'Pending' then 'initiated'
                       when 'Not done' then 'not_started'
                       when 'NA' then 'not_started'
                     end,
       done_at = case when status = 'Done' then coalesce(done_at, updated_at) else done_at end,
       approver_status = case when status = 'NA' then coalesce(approver_status, 'cancelled') else approver_status end
 where doer_status is null and status in ('Done', 'Pending', 'Not done', 'NA');

create index if not exists dcc_entries_item_date_idx on dcc_entries (item_id, entry_date);

-- 0240_incentive_entry_reversal.sql
alter table incentive_entries
  add column if not exists reversed       boolean     not null default false,
  add column if not exists reversed_at    timestamptz,
  add column if not exists reversed_by_id uuid references employees(id) on delete set null;

create index if not exists incentive_entries_reversed_idx on incentive_entries (reversed);

-- 0241_template_files.sql
CREATE TABLE IF NOT EXISTS template_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL,
  storage_path  text NOT NULL,
  content_type  text NOT NULL,
  file_name     text NOT NULL,
  file_size     integer NOT NULL,
  updated_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS template_files_key_uq ON template_files (key);

-- 0242_two_step_verification.sql
CREATE TABLE IF NOT EXISTS two_step_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS two_step_challenges_token_uniq
  ON two_step_challenges (token_hash);

CREATE INDEX IF NOT EXISTS two_step_challenges_employee_created_idx
  ON two_step_challenges (employee_id, created_at);

CREATE TABLE IF NOT EXISTS two_step_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email         text NOT NULL,
  method        text NOT NULL DEFAULT 'email',
  challenge_id  uuid REFERENCES two_step_challenges(id) ON DELETE SET NULL,
  verified_at   timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz NOT NULL,
  ip            text,
  user_agent    text
);

CREATE INDEX IF NOT EXISTS two_step_verifications_employee_idx
  ON two_step_verifications (employee_id, verified_at);

CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0242_two_step_verification.sql')
ON CONFLICT DO NOTHING;

COMMIT;
