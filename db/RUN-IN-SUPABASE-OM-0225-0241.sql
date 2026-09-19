-- PART 1 - RUN IN SUPABASE: the Om branch migrations, as merged.
-- 0225 0226 0227 0228 0229 0230 0231 0232 0234 0240 0241, in that order.
-- Run PART 0 first; nothing in it may say STOP. Then run this whole file once.
-- One transaction: if anything fails, nothing changes. Safe to run twice.
-- Afterwards run PART 2. Every row must PASS and the HR count must not drop.
-- The comments were removed on purpose: the Supabase SQL editor misreads an
-- apostrophe inside a comment as a quote. The explained originals are the
-- files in db/migrations, which this is built from word for word.

BEGIN;

DO $guard$
DECLARE
  n bigint;
  words text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'incentive_eligibility' AND column_name = 'incentive_id') THEN
    RAISE EXCEPTION 'STOP: incentive_eligibility is not the Rohan table (no incentive_id). Nothing has been changed. Send this to Claude.';
  END IF;

  SELECT string_agg(code, ', ') INTO words FROM (
    SELECT lower(to_jsonb(e) ->> 'employee_code') AS code
      FROM employees e
     WHERE to_jsonb(e) ->> 'employee_code' IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1) d;
  IF words IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: duplicate employee codes (0225 needs them unique): %. Nothing has been changed. Send this to Claude.', words;
  END IF;

  SELECT string_agg(DISTINCT quote_literal(status), ', ') INTO words
    FROM incentive_requests
   WHERE status IS NULL
      OR status NOT IN ('pending','approved','rejected','due','not_due','reversed','revision_requested');
  IF words IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: incentive requests hold statuses 0230 does not allow: %. Nothing has been changed. Send this to Claude.', words;
  END IF;

  SELECT count(*) INTO n FROM employees e
   WHERE e.department_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = e.department_id)
     AND NOT EXISTS (SELECT 1 FROM departments d
                      WHERE e.department IS NOT NULL AND lower(btrim(e.department)) = lower(d.name));
  IF n > 0 THEN
    RAISE EXCEPTION 'STOP: 0234 would clear the Function of % employee(s). Production was expected to have none. Nothing has been changed. Send this to Claude.', n;
  END IF;

  SELECT count(*) INTO n FROM employee_departments ed
   WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = ed.department_id);
  IF n > 0 THEN
    RAISE EXCEPTION 'STOP: 0234 would delete % extra-Function link(s). Production was expected to have none. Nothing has been changed. Send this to Claude.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM departments GROUP BY lower(name) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'STOP: two Functions share a name ignoring case; the 0234 unique index would fail. Nothing has been changed. Send this to Claude.';
  END IF;

  SELECT count(*) INTO n FROM jd_positions p
   WHERE p.department_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = p.department_id);
  IF n > 0 THEN
    RAISE EXCEPTION 'STOP: % JD position(s) point at a missing Function; the 0234 foreign key would fail. Nothing has been changed. Send this to Claude.', n;
  END IF;

  SELECT string_agg(name, ', ') INTO words FROM (
    SELECT name FROM paying_entities
     WHERE name IN ('Altus Corp','Unleashed','Khushboo','The Gainmakers (MJV HUF)','Legacy Creators (JSV HUF)')
     GROUP BY name HAVING count(*) > 1) x;
  IF words IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: paying entities named twice (0227 would give both the same letter): %. Nothing has been changed. Send this to Claude.', words;
  END IF;
END
$guard$;

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

alter table incentive_entries
  add column if not exists reversed       boolean     not null default false,
  add column if not exists reversed_at    timestamptz,
  add column if not exists reversed_by_id uuid references employees(id) on delete set null;

create index if not exists incentive_entries_reversed_idx on incentive_entries (reversed);

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

COMMIT;
