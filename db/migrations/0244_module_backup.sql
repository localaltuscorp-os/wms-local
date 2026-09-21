-- 0244 — module-wise export to Google Drive
--
-- Every module gets an Export button, and once a night at 03:00 IST each module
-- is saved into Google Drive: one folder per module, a dated folder per run,
-- an Excel workbook (one tab per dataset) and the files its rows point at.
--
-- FIRST RUN IS EVERYTHING, AFTER THAT ONLY WHAT CHANGED. module_backup_modules
-- .exported_through is the watermark: the next run exports what came after it.
-- Without that, a nightly export of every module would copy the whole company
-- into Drive every night.
--
-- SEPARATE FROM THE PER-PERSON HR BACKUP (0225). Different Google account
-- (MODULE_BACKUP_DRIVE_ACCOUNT, not hr.altuscorp@gmail.com), different folder,
-- different permission list. Connecting or disconnecting one leaves the other
-- alone — asked for on 21 Sep.
--
-- ADDITIVE ONLY: four new tables, no change to any existing one. Apply BEFORE
-- deploying the code.

CREATE TABLE IF NOT EXISTS module_backup_settings (
  id                 integer PRIMARY KEY DEFAULT 1,
  account_email      text,
  -- Ciphertext (lib/accounts/crypto). Never selected into a browser response.
  refresh_token_enc  text,
  connected_by_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  connected_at       timestamptz,
  -- The app creates its own root folder: the drive.file scope cannot see a
  -- folder someone made by hand, so looking one up by name would find nothing.
  root_folder_id     text,
  schedule_enabled   boolean NOT NULL DEFAULT true,
  -- 03:00 IST. Stored rather than hardcoded so the hour can move without a deploy.
  run_hour_ist       integer NOT NULL DEFAULT 3,
  last_error         text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_backup_settings_one_row CHECK (id = 1),
  CONSTRAINT module_backup_settings_hour CHECK (run_hour_ist BETWEEN 0 AND 23)
);

INSERT INTO module_backup_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS module_backup_modules (
  -- A workspace id from lib/workspaces.ts. Text, not an enum: a new module is a
  -- code change, and an enum would make it a migration as well.
  module_id          text PRIMARY KEY,
  enabled            boolean NOT NULL DEFAULT true,
  -- THE WATERMARK. NULL = never exported, so the next run is the full one.
  exported_through   timestamptz,
  last_full_at       timestamptz,
  last_run_at        timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_backup_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          text NOT NULL,
  kind               text NOT NULL,          -- full | incremental | manual
  status             text NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  -- The window: after `since`, up to `until`. `until` is fixed when the run
  -- starts, so rows written mid-run belong to the next one instead of being
  -- half-caught by this one.
  since              timestamptz,
  until              timestamptz NOT NULL,
  -- Where a resumed run continues: which dataset, how many files copied, and
  -- the Drive folder already created for it.
  cursor             jsonb,
  counts             jsonb,
  folder_name        text,
  requested_by_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- Held while a chunk is in flight: two invocations must not run one export.
  lock_until         timestamptz,
  error              text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);

CREATE INDEX IF NOT EXISTS module_backup_runs_module_idx
  ON module_backup_runs (module_id, started_at);
CREATE INDEX IF NOT EXISTS module_backup_runs_status_idx
  ON module_backup_runs (status);

-- WHO MAY PRESS EXPORT, per module. Access to a module is not access to its
-- export: reading one screen is a different thing from carrying the whole
-- module out of the building.
CREATE TABLE IF NOT EXISTS module_backup_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          text NOT NULL,
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  granted_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS module_backup_grants_uniq
  ON module_backup_grants (module_id, employee_id);
CREATE INDEX IF NOT EXISTS module_backup_grants_module_idx
  ON module_backup_grants (module_id);

-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0244_module_backup.sql')
ON CONFLICT DO NOTHING;
