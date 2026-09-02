-- 0206 — a registered device is a LAPTOP or a PHONE, one of each per employee.
--
-- THE RULE: every employee designates one laptop and one phone, and attendance
-- may be punched from EITHER. Not both-or-nothing — a laptop away for repair
-- must leave the phone working, and vice versa. So the constraint is "at most
-- one approved device of each kind", never "a device is required".
--
-- WHY A KIND COLUMN AND NOT A SECOND TABLE: the allowlist, the approval
-- lifecycle, the revoke path and the punch-time resolver are identical for both.
-- The only thing that differs is which cap a new registration counts against.
-- A second table would duplicate all four for one integer's worth of difference.
--
-- EXISTING ROWS ARE PHONES. `mobile_devices` was populated exclusively by the
-- mobile app's keystore id (see lib/attendance/mobile-devices.ts), so 'phone' is
-- the accurate default rather than a convenient one. Laptops arrive from the web
-- punch path, which had no device gate at all before this.
--
-- THE DEMOTION BELOW IS NOT DECORATIVE: the old cap allowed TWO approved devices
-- per employee with no notion of kind, so a person could hold two approved
-- phones. Creating the unique index against that data would fail and abort the
-- migration. Extras are revoked oldest-first, keeping the most recently used —
-- the one they are actually carrying. On the production roster this affects
-- nobody (5 devices, none doubled up), but a restored or older database is
-- exactly where an un-guarded index creation bites.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply.

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'phone';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mobile_devices_kind_chk'
  ) THEN
    ALTER TABLE mobile_devices
      ADD CONSTRAINT mobile_devices_kind_chk CHECK (kind IN ('laptop', 'phone'));
  END IF;
END $$;

-- Keep the newest-used approved device per (employee, kind); revoke the rest.
UPDATE mobile_devices m
   SET status = 'revoked', revoked_at = now()
 WHERE m.status = 'approved'
   AND m.id <> (
     SELECT k.id
       FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.kind = m.kind
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 1
   );

-- THE GUARANTEE: at most one approved laptop and one approved phone per person.
-- Partial on `status` so revoked and pending rows accumulate freely — history is
-- worth keeping, and a pending registration must not be blocked by the approved
-- device it is meant to replace.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_employee_kind_approved_uq
  ON mobile_devices (employee_id, kind)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS mobile_devices_kind_idx ON mobile_devices (kind);
