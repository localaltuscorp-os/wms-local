-- 0225 — HR RECORDS: per-person export + scheduled Google Drive save.
--
-- ── WHAT THIS IS ───────────────────────────────────────────────────────────
-- HR can download one ZIP per person (every filled form as a PDF, every scanned
-- document, every letter), and the same set is saved on a schedule into an
-- "HR Records" folder in the HR Google account's Drive — one folder per person,
-- kept up to date rather than duplicated each month.
--
-- The ZIP needs no storage at all. The Drive save needs two things remembered:
--
--   1. hr_records_drive_settings — ONE row (id = 1): which Google account is
--      connected, its refresh token (ENCRYPTED by the app, never plain), the
--      schedule, and the progress of the pass that is running. A pass walks
--      people in id order and records the last one finished in `run_cursor`, so
--      a pass that outlives one serverless invocation resumes where it stopped.
--
--   2. hr_records_drive_items — what has already been put in Drive: logical key
--      → Drive file id + the version that was uploaded. It is what makes the
--      monthly save an UPDATE (unchanged files are skipped, changed ones are
--      overwritten in place) instead of a fresh copy of everything.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Additive only: two new tables, one seeded settings row. No existing table is
-- touched, no row is updated or deleted. Idempotent — safe to run twice.
--
-- RLS is ENABLED with NO policies. The app connects as the table owner and is
-- unaffected; the Supabase REST roles (anon / authenticated) get nothing, which
-- is the point for a table that holds an OAuth refresh token.

CREATE TABLE IF NOT EXISTS hr_records_drive_settings (
  id integer PRIMARY KEY DEFAULT 1,
  -- The Google account the files go to. Lower-cased.
  account_email text,
  -- AES-GCM ciphertext from lib/accounts/crypto.ts encryptSecret(). NULL = not connected.
  refresh_token_enc text,
  connected_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  connected_at timestamptz,

  -- Schedule: every `interval_months` month(s), on `day_of_month` (IST).
  schedule_enabled boolean NOT NULL DEFAULT false,
  interval_months integer NOT NULL DEFAULT 1,
  day_of_month integer NOT NULL DEFAULT 1,

  -- Progress. run_cursor: NULL = idle, '' = a pass started and nobody is done
  -- yet, otherwise the employees.id of the last person finished.
  run_cursor text,
  last_run_started_at timestamptz,
  last_completed_at timestamptz,
  last_run_summary jsonb,
  last_error text,
  -- A pass holds this while it runs, so a cron run and a manual "save now"
  -- can never write the same folder at the same time. Expires by itself if
  -- the function running it is killed.
  lock_until timestamptz,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_records_drive_settings_singleton CHECK (id = 1),
  CONSTRAINT hr_records_drive_settings_interval_chk CHECK (interval_months BETWEEN 1 AND 12),
  -- 28, not 31: every month has a 28th, so "day 31" can never silently skip February.
  CONSTRAINT hr_records_drive_settings_day_chk CHECK (day_of_month BETWEEN 1 AND 28)
);

INSERT INTO hr_records_drive_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_records_drive_items (
  -- "folder:root" | "folder:<employee id>" | "folder:<employee id>/Forms"
  -- | "file:<employee id>/<entry key>"
  key text PRIMARY KEY,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  drive_id text NOT NULL,
  -- What was uploaded (a storage path, an updated_at …). NULL for folders.
  version text,
  -- The name it was given in Drive, so a rename is noticed.
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_records_drive_items_employee_idx
  ON hr_records_drive_items (employee_id);

ALTER TABLE hr_records_drive_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_records_drive_items ENABLE ROW LEVEL SECURITY;
