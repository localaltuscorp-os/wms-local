-- 0224 — THE REGISTRATION FIELD BECOMES THE DEVICE NAME, not the BIOS serial.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- 0222 asked every employee for their laptop's BIOS serial at first login. On
-- the roster this is being rolled out to, that was the wrong ask twice over:
--
--   1. THE INSTRUCTIONS WERE DEAD. The modal's primary command was
--      `wmic bios get serialnumber`, and `wmic.exe` no longer exists on
--      Windows 11 24H2 and later (build 26100+). Verified on the account
--      holder's own machine, build 26200: the binary is simply absent. The
--      PowerShell fallback works, but it was printed second and most people
--      stopped at the first line that failed.
--
--   2. EVEN WORKING, IT IS A COMMAND. Most of this roster is non-technical.
--      "Open PowerShell and run this" is a support ticket per employee.
--
-- The DEVICE NAME is visible with no command at all — Settings › System ›
-- About, or Win+Pause, where it is the first row on the page. That is the
-- difference between a form somebody can complete and one they cannot.
--
-- ── WHAT IS TRADED AWAY, HONESTLY ──────────────────────────────────────────
-- A BIOS serial is unique and unchangeable. A device name is neither:
--
--   · the employee can rename it at any time (Settings › Rename this PC), and
--   · corporately imaged or cloned machines routinely SHARE one, which a
--     random consumer install ("DESKTOP-2874MGH") does not.
--
-- The second is the one that bites: under the unique index below, the second
-- person carrying a duplicate name is refused. That is why the collision
-- message names the remedy instead of just saying no.
--
-- This is an acceptable trade because of what the field is FOR. It is not the
-- device identity and never was — `device_id` is, server-minted and unique, and
-- it is what every lookup in lib/security/device-access.ts keys on. Nor is it
-- the access boundary: the `att_device` cookie plus the one-approved-laptop cap
-- (`mobile_devices_employee_kind_approved_uq`) do the enforcing. This column's
-- only job is to make it awkward to register one physical laptop under two
-- accounts, and a device name does that nearly as well as a serial while being
-- something people can actually find.
--
-- ── A RENAME, NOT A NEW COLUMN ─────────────────────────────────────────────
-- One identifier, not two. Keeping both would mean the same laptop could be
-- registered twice — once by serial, once by name — under two accounts, which
-- is precisely the thing the unique index exists to prevent.
--
-- No data is migrated because there is none: 0223 emptied `mobile_devices`, and
-- this lands in the same rollout, so the column is empty at rename time
-- (verified: 0 rows, 0 device_consent_events). The rename is written to be safe
-- anyway if that is ever not true — an existing serial simply carries over as
-- the stored value and its owner is never re-prompted.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The column
------------------------------------------------------------------------
-- Rename when the old name is present and the new one is not. Guarded on both
-- sides so a re-run, or a database that already has `device_name`, is a no-op
-- rather than an error.
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

-- Belt and braces: a database that never ran 0222 gets the column outright,
-- so this migration alone is enough to bring the schema into line.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS device_name text;

------------------------------------------------------------------------
-- 2. The uniqueness guarantee, moved with it
------------------------------------------------------------------------
-- 0222's index named the old column. Dropping it is not optional: left in
-- place against a renamed column it would keep enforcing uniqueness under a
-- name nothing in the application reads any more.
DROP INDEX IF EXISTS mobile_devices_bios_serial_uq;

-- One physical laptop, one registration. Partial and lower-cased for the same
-- two reasons as before: phones never carry this value, and the employee types
-- it, so "desktop-2874mgh" and "DESKTOP-2874MGH" must be one machine.
--
-- Windows device names are case-insensitive by definition (NetBIOS), and a Mac's
-- friendly name is whatever the owner typed, so case is the LAST thing that can
-- be trusted to be stable here.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_name_uq
  ON mobile_devices (lower(device_name))
  WHERE device_name IS NOT NULL AND kind = 'laptop';
