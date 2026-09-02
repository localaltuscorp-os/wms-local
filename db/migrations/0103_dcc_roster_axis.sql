-- 0103 — DCC v2 "Roster-Axis + Schedule-Kind". Additive; ZERO row rewrites.
-- (ADD COLUMN … NOT NULL DEFAULT <constant> is metadata-only on modern Postgres.)

-- 1a. dcc_kpi_items additive columns
ALTER TABLE dcc_kpi_items
  ADD COLUMN IF NOT EXISTS schedule_kind       text    NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS is_participant_list boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_id           uuid,
  ADD COLUMN IF NOT EXISTS template_code       text,
  ADD COLUMN IF NOT EXISTS needs_review        boolean NOT NULL DEFAULT false;

-- 1b. dcc_clients (section instancing)
CREATE TABLE IF NOT EXISTS dcc_clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  section           text NOT NULL,
  name              text NOT NULL,
  client_ref        uuid,
  sort_order        integer NOT NULL DEFAULT 0,
  archived          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dcc_clients_owner_idx ON dcc_clients (owner_employee_id, section, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS dcc_clients_owner_section_name_uq
  ON dcc_clients (owner_employee_id, section, lower(name));

DO $$ BEGIN
  ALTER TABLE dcc_kpi_items
    ADD CONSTRAINT dcc_kpi_items_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES dcc_clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS dcc_kpi_items_client_idx ON dcc_kpi_items (client_id);

-- 1c. dcc_subjects (participant roster)
CREATE TABLE IF NOT EXISTS dcc_subjects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name              text NOT NULL,
  kind              text,
  external_ref      uuid,
  sort_order        integer NOT NULL DEFAULT 0,
  archived          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dcc_subjects_owner_idx ON dcc_subjects (owner_employee_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS dcc_subjects_owner_name_uq
  ON dcc_subjects (owner_employee_id, lower(name));

-- 1d. dcc_item_subjects (participant links + per-subject overrides)
CREATE TABLE IF NOT EXISTS dcc_item_subjects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES dcc_kpi_items(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES dcc_subjects(id) ON DELETE CASCADE,
  schedule_kind text,
  weekdays      smallint,
  sort_order    integer NOT NULL DEFAULT 0,
  archived      boolean NOT NULL DEFAULT false,
  CONSTRAINT dcc_item_subjects_uq UNIQUE (item_id, subject_id)
);
CREATE INDEX IF NOT EXISTS dcc_item_subjects_item_idx ON dcc_item_subjects (item_id, sort_order);

-- 1e. dcc_entries spine generalization (subject axis)
ALTER TABLE dcc_entries ADD COLUMN IF NOT EXISTS subject_id uuid;
DO $$ BEGIN
  ALTER TABLE dcc_entries
    ADD CONSTRAINT dcc_entries_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES dcc_subjects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Generalize the unique key WITHOUT downtime: add the COALESCE-sentinel expression
-- index UNDER A NEW NAME and KEEP the old 2-column dcc_entries_uq for now. Both
-- coexist safely while no participant rows exist, so the currently-deployed code
-- (2-col ON CONFLICT) and the new code (expression ON CONFLICT) both work during
-- the deploy window. The old 2-col index is dropped in 0104 right before the
-- re-import introduces participant rows (which the 2-col would otherwise reject).
CREATE UNIQUE INDEX IF NOT EXISTS dcc_entries_subject_uq ON dcc_entries
  (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS dcc_entries_subject_idx ON dcc_entries (subject_id);

-- 1f. backfill (covered by DEFAULTs; explicit no-op for any pre-existing NULL)
UPDATE dcc_kpi_items SET schedule_kind = 'scheduled' WHERE schedule_kind IS NULL;
-- weekdays deliberately left AS-IS (null/0 stays "always due" for legacy parity).
