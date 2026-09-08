-- Columns/values production got from STANDALONE scripts rather than a
-- `db/migrations/*.sql` file, so a database built purely from the migration set
-- is missing them and a later migration fails against it.
--
-- Run this BETWEEN two passes of the migration runner (see the ordering note in
-- supabase-stubs.sql). Idempotent.
--
--   psql -h 127.0.0.1 -p 55432 -U postgres -d altus_corp_dev -f db/local/schema-gaps.sql

-- 0024 deliberately leaves its `alter type ... add value` commented out (it
-- cannot run inside the runner's transaction) and expects
-- scripts/apply-dont-know.ts to have run it. On a fresh DB, nothing has.
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'dont_know';

-- The mobile_devices approval lifecycle (Phase 1 anti-proxy, 2026-08) is in
-- db/schema.ts and is read by 0206_device_kind_laptop_phone.sql, but no
-- migration file ever adds these four columns.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at      timestamptz;
