-- 0205a — the device-allowlist APPROVAL LIFECYCLE columns on mobile_devices.
--
-- ── WHY THIS FILE DID NOT EXIST UNTIL NOW ──────────────────────────────────
-- `status`, `approved_by_id`, `approved_at` and `revoked_at` have been in
-- db/schema.ts and in the production database since the Phase 1 anti-proxy work
-- (2026-08), but NO migration in this repo ever created them: production was
-- patched directly, the way 0024's ADD VALUE is, and the tree was never made to
-- agree.
--
-- That stayed invisible because every database anyone touched already had the
-- columns. It surfaced on 2026-09-08 building a brand-new Supabase project from
-- these migrations: 0063 creates mobile_devices WITHOUT them, and 0206 — the
-- first file to reference `status` — dies on `column m.status does not exist`,
-- taking every migration after it down with it.
--
-- ── WHY 0205a AND NOT 0215 ─────────────────────────────────────────────────
-- The applier runs files in FILENAME order, and 0206 needs these columns to
-- exist before it runs. `0205a` sorts after `0205_remote_work_approval.sql`
-- ('_' < 'a') and before `0206_` ('5' < '6'), so it lands exactly where the
-- history always implied it was. A 0215 would be correct chronologically and
-- useless practically — 0206 would still fail on every fresh build.
--
-- On a database that already has these columns every statement here no-ops, so
-- this is safe on production and required on a new one.

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- 'approved' is the DEFAULT deliberately, and it is the same fail-safe choice
-- the original rollout made: existing rows were devices already in daily use, so
-- defaulting them to 'pending' would have locked every one of those people out
-- of attendance the moment the allowlist began to be enforced.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS approved_by_id uuid;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mobile_devices_approved_by_id_fkey'
  ) THEN
    ALTER TABLE mobile_devices
      ADD CONSTRAINT mobile_devices_approved_by_id_fkey
      FOREIGN KEY (approved_by_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;
