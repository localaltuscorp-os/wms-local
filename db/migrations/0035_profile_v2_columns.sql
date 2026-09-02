-- 0035 — Profile v2 columns on employees
-- All defaults chosen so existing rows behave identically to today;
-- no backfill required.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bio                         text,
  ADD COLUMN IF NOT EXISTS tags                        text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability                text     NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS availability_auto_revert_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone                    text     NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS working_hours_start         time     NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS working_hours_end           time     NOT NULL DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS working_days                integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS quiet_hours_start           time,
  ADD COLUMN IF NOT EXISTS quiet_hours_end             time,
  ADD COLUMN IF NOT EXISTS digest_time                 time     NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS digest_frequency            text     NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS theme                       text     NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS density                     text     NOT NULL DEFAULT 'cozy',
  ADD COLUMN IF NOT EXISTS accent                      text     NOT NULL DEFAULT '#E10600',
  ADD COLUMN IF NOT EXISTS ooo_start                   date,
  ADD COLUMN IF NOT EXISTS ooo_end                     date,
  ADD COLUMN IF NOT EXISTS ooo_delegate_id             uuid REFERENCES employees(id) ON DELETE SET NULL;

-- Constrain enum-ish columns
DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_availability_chk
    CHECK (availability IN ('available','focused','heads_down','away'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_theme_chk
    CHECK (theme IN ('light','dark','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_density_chk
    CHECK (density IN ('cozy','compact'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_digest_frequency_chk
    CHECK (digest_frequency IN ('off','daily','weekly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_bio_len_chk
    CHECK (bio IS NULL OR length(bio) <= 280);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_tags_count_chk
    CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 8);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helpful index for finding active OOO windows (cron use)
CREATE INDEX IF NOT EXISTS employees_ooo_active_idx
  ON employees (ooo_start, ooo_end)
  WHERE ooo_start IS NOT NULL AND ooo_end IS NOT NULL;
