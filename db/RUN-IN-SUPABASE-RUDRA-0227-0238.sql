-- RUN IN SUPABASE: the Executive Calendar, Client Engagement, HR registers,
-- the Operations directory and broadcast recurrence.
--
-- Seven migrations from the Rudra branch, in the order they must run, with
-- every comment stripped: the SQL editor reads an apostrophe inside a comment
-- as an opening quote and fails on everything after it.
--
-- Guarded throughout (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS before ADD),
-- so running it twice changes nothing the second time. One statement writes
-- DATA: 0238 seeds eight Client Engagement team members, matched to a login by
-- email, and skips anyone already there.


-- ======================================================================
-- 0227_hr_address_book_asset_register.sql  --  HR Address Book + Asset Register
-- ======================================================================

CREATE TABLE IF NOT EXISTS "hr_contacts" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_name"  text,
  "person_name"   text NOT NULL,
  "cell_no"       text,
  "alternate_no"  text,
  "email"         text,
  "service"       text NOT NULL DEFAULT 'Other',
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_contacts_active_idx" ON "hr_contacts" ("is_active");
CREATE INDEX IF NOT EXISTS "hr_contacts_service_idx" ON "hr_contacts" ("service");

CREATE TABLE IF NOT EXISTS "hr_asset_counters" (
  "prefix" text PRIMARY KEY,
  "last"   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "hr_assets" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "asset_code"         text NOT NULL UNIQUE,
  "asset_type"         text NOT NULL,
  "asset_name"         text NOT NULL,
  "location"           text,
  "serial_no"          text,
  "model"              text,
  "make"               text,
  "description"        text,
  "specifications"     text,
  "warranty_until"     date,
  "under_amc"          boolean NOT NULL DEFAULT false,
  "vendor_name"        text,
  "photo_path"         text,
  "invoice_path"       text,

  "issued_kind"        text NOT NULL DEFAULT 'none'
                       CHECK ("issued_kind" IN ('person', 'office', 'none')),
  "issued_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "issued_office"      text,
  "notes"              text,
  "username"           text,
  "password_enc"       text,
  "created_by_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_assets_type_idx" ON "hr_assets" ("asset_type");
CREATE INDEX IF NOT EXISTS "hr_assets_issued_employee_idx" ON "hr_assets" ("issued_employee_id");


-- ======================================================================
-- 0228_ops_vendor_directory.sql  --  Operations vendor directory
-- ======================================================================

CREATE TABLE IF NOT EXISTS "ops_vendors" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category"      text NOT NULL DEFAULT 'Other',
  "first_name"    text NOT NULL,
  "last_name"     text,
  "cell_no"       text,
  "email"         text,
  "address_line1" text,
  "address_line2" text,
  "address_line3" text,
  "address_line4" text,
  "landmark"      text,
  "city"          text,
  "state"         text,
  "pincode"       text,
  "website"       text,
  "amc"           boolean NOT NULL DEFAULT false,
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ops_vendors_active_idx" ON "ops_vendors" ("is_active");
CREATE INDEX IF NOT EXISTS "ops_vendors_category_idx" ON "ops_vendors" ("category");


-- ======================================================================
-- 0229_broadcast_recurrence_whatsapp.sql  --  Broadcast recurrence + WhatsApp outcomes
-- ======================================================================

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recurrence_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recurrence_anchor timestamptz;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz;

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS channel_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS broadcasts_due_idx ON broadcasts (scheduled_for) WHERE status = 'scheduled';


-- ======================================================================
-- 0230_client_engagement.sql  --  Client Engagement, first version
-- ======================================================================

ALTER TABLE pa_entries ALTER COLUMN person_id DROP NOT NULL;

ALTER TABLE pa_entries DROP CONSTRAINT IF EXISTS pa_entries_status_chk;

ALTER TABLE pa_entries DROP CONSTRAINT IF EXISTS pa_entries_highlight_chk;
ALTER TABLE pa_entries ADD CONSTRAINT pa_entries_highlight_chk
  CHECK (highlight IS NULL OR highlight IN ('active','barter','revenue_share'));

ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE pa_ambassadors DROP CONSTRAINT IF EXISTS pa_ambassadors_status_chk;
ALTER TABLE pa_ambassadors ADD CONSTRAINT pa_ambassadors_status_chk
  CHECK (status IS NULL OR status IN ('active','barter','revenue_share'));

ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS owner_person_id uuid
  REFERENCES pa_people(id) ON DELETE SET NULL;

ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE pa_people ADD COLUMN IF NOT EXISTS is_ce_lead boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pa_people_employee_idx ON pa_people (employee_id);

ALTER TABLE pa_calls ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE pa_calls ADD COLUMN IF NOT EXISTS end_time   time;
ALTER TABLE pa_calls DROP CONSTRAINT IF EXISTS pa_calls_time_window;
ALTER TABLE pa_calls ADD CONSTRAINT pa_calls_time_window
  CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time >= '10:00' AND end_time <= '20:00' AND end_time > start_time)
  );

CREATE TABLE IF NOT EXISTS pa_assignment_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN ('entry','ambassador')),
  entity_id      uuid NOT NULL,
  from_person_id uuid REFERENCES pa_people(id) ON DELETE SET NULL,
  to_person_id   uuid REFERENCES pa_people(id) ON DELETE SET NULL,
  actor_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pa_assignment_events_entity_idx
  ON pa_assignment_events (entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS ce_dropdown_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key   text NOT NULL,
  code       text NOT NULL,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ce_dropdown_options_key_code_uidx
  ON ce_dropdown_options (list_key, code);


-- ======================================================================
-- 0231_exec_calendar.sql  --  Executive calendar
-- ======================================================================

CREATE TABLE IF NOT EXISTS exec_calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title           text NOT NULL,
  category_key    text NOT NULL,
  event_date      date NOT NULL,
  start_min       integer,
  end_min         integer,
  all_day         boolean NOT NULL DEFAULT false,
  visibility      text NOT NULL DEFAULT 'public',
  location        text,
  notes           text,
  client_entry_id uuid REFERENCES pa_entries(id) ON DELETE SET NULL,
  batch_label     text,
  routine_id      uuid,
  created_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_category_chk;
ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_category_chk
  CHECK (category_key IN ('personal','recovery','client','cohort','bizdev','ops','marker'));

ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_visibility_chk;
ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_visibility_chk
  CHECK (visibility IN ('public','busy','private'));

ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_time_chk;
ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_time_chk
  CHECK (
    (all_day = true AND start_min IS NULL AND end_min IS NULL)
    OR (start_min IS NULL AND end_min IS NULL)
    OR (start_min >= 0 AND end_min <= 1440 AND end_min > start_min)
  );

CREATE INDEX IF NOT EXISTS exec_calendar_events_owner_date_idx
  ON exec_calendar_events (owner_id, event_date);
CREATE INDEX IF NOT EXISTS exec_calendar_events_date_idx
  ON exec_calendar_events (event_date);
CREATE INDEX IF NOT EXISTS exec_calendar_events_client_idx
  ON exec_calendar_events (client_entry_id);

CREATE TABLE IF NOT EXISTS exec_calendar_routines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title         text NOT NULL,
  category_key  text NOT NULL,
  days_of_week  integer[] NOT NULL DEFAULT '{}',
  start_min     integer NOT NULL,
  end_min       integer NOT NULL,
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  visibility    text NOT NULL DEFAULT 'public',
  is_active     boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_routines DROP CONSTRAINT IF EXISTS exec_calendar_routines_category_chk;
ALTER TABLE exec_calendar_routines ADD CONSTRAINT exec_calendar_routines_category_chk
  CHECK (category_key IN ('personal','recovery','client','cohort','bizdev','ops','marker'));

ALTER TABLE exec_calendar_routines DROP CONSTRAINT IF EXISTS exec_calendar_routines_time_chk;
ALTER TABLE exec_calendar_routines ADD CONSTRAINT exec_calendar_routines_time_chk
  CHECK (start_min >= 0 AND end_min <= 1440 AND end_min > start_min AND to_date >= from_date);

CREATE INDEX IF NOT EXISTS exec_calendar_routines_owner_idx
  ON exec_calendar_routines (owner_id, is_active);

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exec_calendar_events_routine_fk'
  ) THEN
    ALTER TABLE exec_calendar_events
      ADD CONSTRAINT exec_calendar_events_routine_fk
      FOREIGN KEY (routine_id) REFERENCES exec_calendar_routines(id) ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS exec_calendar_events_routine_idx
  ON exec_calendar_events (routine_id);

CREATE TABLE IF NOT EXISTS exec_calendar_prefs (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  start_min   integer NOT NULL DEFAULT 420,
  end_min     integer NOT NULL DEFAULT 1320,
  slot_min    integer NOT NULL DEFAULT 30,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_prefs DROP CONSTRAINT IF EXISTS exec_calendar_prefs_window_chk;
ALTER TABLE exec_calendar_prefs ADD CONSTRAINT exec_calendar_prefs_window_chk
  CHECK (start_min >= 0 AND end_min <= 1440 AND end_min > start_min AND slot_min IN (30, 60));


-- ======================================================================
-- 0237_exec_calendar_categories_markers.sql  --  Calendar categories, clients, Day Markers
-- ======================================================================

ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_category_chk;
ALTER TABLE exec_calendar_routines DROP CONSTRAINT IF EXISTS exec_calendar_routines_category_chk;

UPDATE exec_calendar_events SET category_key = CASE category_key
    WHEN 'recovery' THEN 'wkly_off'
    WHEN 'client'   THEN 'consulting'
    WHEN 'ops'      THEN 'staff_time'
    WHEN 'marker'   THEN 'festival'
    WHEN 'cohort'   THEN CASE
                           WHEN title ~* '(^|[^a-z])cq([^a-z]|$)' THEN 'cq'
                           WHEN title ~* '(^|[^a-z])ps([^a-z]|$)' THEN 'ps'
                           ELSE 'grad_workshop'
                         END
    WHEN 'bizdev'   THEN CASE WHEN title ~* 'lead[ -]?gen' THEN 'lead_gen' ELSE 'sales' END
  END
  WHERE category_key IN ('recovery','client','ops','marker','cohort','bizdev');

UPDATE exec_calendar_routines SET category_key = CASE category_key
    WHEN 'recovery' THEN 'wkly_off'
    WHEN 'client'   THEN 'consulting'
    WHEN 'ops'      THEN 'staff_time'
    WHEN 'marker'   THEN 'festival'
    WHEN 'cohort'   THEN CASE
                           WHEN title ~* '(^|[^a-z])cq([^a-z]|$)' THEN 'cq'
                           WHEN title ~* '(^|[^a-z])ps([^a-z]|$)' THEN 'ps'
                           ELSE 'grad_workshop'
                         END
    WHEN 'bizdev'   THEN CASE WHEN title ~* 'lead[ -]?gen' THEN 'lead_gen' ELSE 'sales' END
  END
  WHERE category_key IN ('recovery','client','ops','marker','cohort','bizdev');

ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_category_chk
  CHECK (category_key IN ('sales','fixed','consulting','cq','ps','staff_time','lead_gen',
                          'grad_workshop','flexible_time','festival','wkly_off','family_time',
                          'personal','siaa_exam'));
ALTER TABLE exec_calendar_routines ADD CONSTRAINT exec_calendar_routines_category_chk
  CHECK (category_key IN ('sales','fixed','consulting','cq','ps','staff_time','lead_gen',
                          'grad_workshop','flexible_time','festival','wkly_off','family_time',
                          'personal','siaa_exam'));

ALTER TABLE exec_calendar_events ADD COLUMN IF NOT EXISTS client_key text;

CREATE TABLE IF NOT EXISTS exec_calendar_day_markers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  label         text NOT NULL,
  mode          text NOT NULL DEFAULT 'day',
  dates         date[] NOT NULL DEFAULT '{}',
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_day_markers DROP CONSTRAINT IF EXISTS exec_calendar_day_markers_mode_chk;
ALTER TABLE exec_calendar_day_markers ADD CONSTRAINT exec_calendar_day_markers_mode_chk
  CHECK (mode IN ('day','range','dates'));

ALTER TABLE exec_calendar_day_markers DROP CONSTRAINT IF EXISTS exec_calendar_day_markers_shape_chk;
ALTER TABLE exec_calendar_day_markers ADD CONSTRAINT exec_calendar_day_markers_shape_chk
  CHECK (char_length(label) BETWEEN 1 AND 120 AND cardinality(dates) BETWEEN 1 AND 366);

CREATE INDEX IF NOT EXISTS exec_calendar_day_markers_owner_idx
  ON exec_calendar_day_markers (owner_id);

CREATE INDEX IF NOT EXISTS exec_calendar_day_markers_dates_idx
  ON exec_calendar_day_markers USING gin (dates);


-- ======================================================================
-- 0238_client_engagement_v2.sql  --  Client Engagement v2 (seeds 8 team members)
-- ======================================================================

CREATE TABLE IF NOT EXISTS ce_team_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  employee_id         uuid REFERENCES employees(id) ON DELETE SET NULL,
  email               text,
  role                text NOT NULL DEFAULT 'coach',
  active_client_limit integer NOT NULL DEFAULT 20,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_team_members_role_chk
    CHECK (role IN ('coach','consultant','account_manager','admin')),
  CONSTRAINT ce_team_members_limit_chk CHECK (active_client_limit >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ce_team_members_employee_uidx
  ON ce_team_members (employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ce_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  organization     text,
  category         text NOT NULL,
  batch_code       text,
  assigned_to      uuid REFERENCES ce_team_members(id) ON DELETE SET NULL,
  lifecycle_status text NOT NULL DEFAULT 'active',
  hh_status        text NOT NULL DEFAULT 'standard',
  start_date       date,
  end_date         date,
  tags             text[] NOT NULL DEFAULT '{}',
  notes            text,
  hh_entry_id      uuid REFERENCES pa_entries(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_accounts_category_chk
    CHECK (category IN ('ps','bss','retainer','corporate','ambassador')),

  CONSTRAINT ce_accounts_batch_chk
    CHECK (batch_code IS NULL OR category IN ('ps','bss')),
  CONSTRAINT ce_accounts_lifecycle_chk
    CHECK (lifecycle_status IN ('active','inactive','churned','completed')),
  CONSTRAINT ce_accounts_hh_status_chk
    CHECK (hh_status IN ('standard','revenue_share','fee_recovery','not_started','on_hold')),
  CONSTRAINT ce_accounts_dates_chk
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ce_accounts_assigned_idx ON ce_accounts (assigned_to, category);
CREATE INDEX IF NOT EXISTS ce_accounts_category_idx ON ce_accounts (category, batch_code);

CREATE TABLE IF NOT EXISTS ce_engagements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES ce_accounts(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES ce_team_members(id) ON DELETE CASCADE,
  call_type      text NOT NULL,
  day_of_week    text NOT NULL,
  start_time     time NOT NULL,
  end_time       time NOT NULL,
  start_date     date NOT NULL,
  end_date       date,
  notes          text,
  created_by     uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_engagements_call_type_chk
    CHECK (call_type IN ('hh','tool','checkin','reference')),
  CONSTRAINT ce_engagements_day_chk
    CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),

  CONSTRAINT ce_engagements_window_chk
    CHECK (start_time >= '10:00' AND end_time <= '20:00' AND end_time > start_time),
  CONSTRAINT ce_engagements_dates_chk
    CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ce_engagements_member_idx
  ON ce_engagements (team_member_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS ce_engagements_account_idx ON ce_engagements (account_id);

CREATE TABLE IF NOT EXISTS ce_references (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES ce_accounts(id) ON DELETE CASCADE,
  collector_id     uuid REFERENCES ce_team_members(id) ON DELETE SET NULL,
  target_program   text NOT NULL DEFAULT 'general',
  target_count     integer NOT NULL,
  actual_collected integer NOT NULL DEFAULT 0,
  frequency        text NOT NULL DEFAULT 'one_time',
  due_date         date,
  notes            text,

  last_reminded_on date,
  created_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_references_program_chk CHECK (target_program IN ('bss','bss_c','general')),
  CONSTRAINT ce_references_frequency_chk CHECK (frequency IN ('one_time','every_week')),
  CONSTRAINT ce_references_counts_chk CHECK (target_count > 0 AND actual_collected >= 0)
);
CREATE INDEX IF NOT EXISTS ce_references_collector_idx ON ce_references (collector_id);
CREATE INDEX IF NOT EXISTS ce_references_account_idx ON ce_references (account_id);

CREATE TABLE IF NOT EXISTS ce_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,

  action      text NOT NULL,
  summary     text NOT NULL,
  before      jsonb,
  after       jsonb,
  actor_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_audit_log_entity_chk
    CHECK (entity_type IN ('account','engagement','reference','team_member'))
);
CREATE INDEX IF NOT EXISTS ce_audit_log_entity_idx ON ce_audit_log (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS ce_audit_log_recent_idx ON ce_audit_log (created_at DESC);

INSERT INTO ce_team_members (name, employee_id, email, role, sort_order)
SELECT v.name, e.id, v.email, v.role, v.sort_order
FROM (VALUES
  ('Manan',    'manan@unleashed.in',                  'admin',           10),
  ('Ruchita',  'ruchitaambre.altuscorp@gmail.com',    'admin',           20),
  ('Rashmi',   'rashmitripathi.altuscorp@gmail.com',  'coach',           30),
  ('Jeevan',   'jeevanbharambe.altuscorp@gmail.com',  'coach',           40),
  ('Rutvisha', NULL,                                  'coach',           50),
  ('Rohan',    'rohanchoudhary.altuscorp@gmail.com',  'coach',           60),
  ('Mishtie',  'mishtiekanani.altuscorp@gmail.com',   'coach',           70),
  ('Devraj',   NULL,                                  'account_manager', 80)
) AS v(name, email, role, sort_order)
LEFT JOIN employees e ON lower(e.email) = v.email
WHERE NOT EXISTS (
  SELECT 1 FROM ce_team_members t
  WHERE lower(t.name) = lower(v.name)
     OR (e.id IS NOT NULL AND t.employee_id = e.id)
);

