-- 0222 — FIRST-LOGIN DEVICE REGISTRATION: BIOS serial, and a consent audit.
--
-- ── WHAT CHANGES ───────────────────────────────────────────────────────────
-- `mobile_devices` gains four descriptive columns and one new table joins it.
-- No existing column changes type, nothing is dropped, and the device-access
-- rule itself (one approved laptop AND one approved phone, enforced by
-- `mobile_devices_employee_kind_approved_uq` and `mobile_devices_cap_approved_trg`
-- since 0215) is untouched. Registration is a step BEFORE that cap, not a
-- replacement for it.
--
-- ── WHY registered_at EXISTS ───────────────────────────────────────────────
-- The modal has to fire on a device the employee has never registered, and
-- must NOT fire on the ones already in the table. A row's existence cannot
-- answer that: `enroll()` (device-access.ts:452) already writes a row on first
-- sight and, with DEVICE_AUTO_ADOPT on, marks it `approved` immediately. So a
-- device can be approved and yet never have been through a registration form.
--
-- `registered_at` records that a HUMAN completed the form. Existing rows are
-- backfilled below, which is what keeps every device already in use from
-- suddenly demanding registration from the person using it.
--
-- ── WHY THE BIOS SERIAL IS NOT THE DEVICE IDENTITY ─────────────────────────
-- `device_id` remains the technical identifier — server-minted, unique, and
-- what every lookup in device-access.ts keys on. The BIOS serial is an
-- ATTRIBUTE the employee types in, used to prove one physical laptop is not
-- being registered twice across two accounts. Making it the identity would mean
-- trusting a value the employee can retype at will.
--
-- Uniqueness is scoped to laptops and to non-NULL values: phones never carry
-- one, and a partial index lets any number of rows leave it empty.

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS bios_serial_number text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS manufacturer text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS model text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

-- One physical laptop cannot be registered twice, in either direction: not by
-- two employees, and not twice by one. Case-insensitive because the employee
-- types it — "5CD1234ABC" and "5cd1234abc" are the same machine.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_bios_serial_uq
  ON mobile_devices (lower(bios_serial_number))
  WHERE bios_serial_number IS NOT NULL AND kind = 'laptop';

-- Every device that predates this migration counts as already registered.
-- Without this, everyone in the roster meets a registration modal on their next
-- page load for a laptop they have been using for months.
UPDATE mobile_devices
   SET registered_at = COALESCE(approved_at, created_at, now())
 WHERE registered_at IS NULL;

-- ── CONSENT AUDIT ──────────────────────────────────────────────────────────
-- A row per act of consent, never updated and never deleted — the point of an
-- audit record is that it says what was agreed to, when, and under which
-- wording. `consent_version` is what makes a future terms change enforceable:
-- bump it to 'device-registration-v2' and every employee whose newest row still
-- reads v1 is due to re-consent.
--
-- device_id is stored alongside device_row_id on purpose. The row reference can
-- go NULL if a device record is ever removed; the text id keeps the audit
-- legible after that.
--
-- Deliberately NOT stored: user agent, IP, screen, fonts, timezone or any other
-- fingerprint. The record exists to prove consent, not to profile the person.
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
