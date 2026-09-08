-- 0214 — TWO approved devices per employee, of ANY kind.
--
-- THE RULE CHANGES, NOT THE COUNT. 0206 gave everyone one laptop AND one phone:
-- two devices, but the pair was forced. The rule asked for now is simply "two
-- devices per person, the category does not matter" — two laptops, two phones,
-- a desktop and a phone, whatever the person actually works from. The total is
-- unchanged at two, so nobody gains or loses capacity; only the shape does.
--
-- `kind` STAYS. It is still the honest description of what a row is, it names
-- the device on the admin screen, and the web punch still derives it from the
-- user agent. What it no longer does is decide which cap a registration counts
-- against — that is now one cap over the whole employee.
--
-- ── WHY A TRIGGER AND NOT AN INDEX ────────────────────────────────────────
-- "At most one approved row per (employee, kind)" is expressible as a partial
-- unique index, which is why 0206 used one. "At most TWO approved rows per
-- employee" is not: a unique index constrains duplicates, not cardinality.
-- Dropping the 0206 index with nothing in its place would leave the cap enforced
-- in application code alone, where two concurrent approvals can both read "1
-- approved" and both write. So the guarantee moves into a trigger.
--
-- The advisory lock is the part that makes it a guarantee rather than a check.
-- Without it the trigger has exactly the race it is meant to close, because two
-- transactions cannot see each other's uncommitted rows. Locking on the employee
-- id serialises concurrent approvals for ONE person and nobody else.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

-- Safety net, not a data fix: 0206's index capped everyone at one approved
-- device per kind, so at most two total, so this UPDATE is expected to match
-- zero rows on any database that ran it. It exists for a restored or older
-- database where a third approved row could otherwise sit above the new cap and
-- make the trigger's first firing look like a bug. Keeps the two most recently
-- used; revokes the rest.
UPDATE mobile_devices m
   SET status = 'revoked', revoked_at = now()
 WHERE m.status = 'approved'
   AND m.id NOT IN (
     SELECT k.id
       FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 2
   );

-- The 0206 guarantee, retired. Leaving it would silently keep the old rule:
-- a second laptop would still be refused, by a constraint name instead of a
-- sentence.
DROP INDEX IF EXISTS mobile_devices_employee_kind_approved_uq;

CREATE OR REPLACE FUNCTION mobile_devices_cap_approved() RETURNS trigger AS $fn$
DECLARE
  approved_others int;
BEGIN
  -- Only an approved row consumes a slot. Pending registrations and revoked
  -- history accumulate freely: a replacement must be registerable while the
  -- device it succeeds is still approved.
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  -- An UPDATE that leaves an already-approved row approved (touching
  -- last_used_at, say — the punch path does this on every punch) changes no
  -- count and must not pay for a lock or a scan.
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND OLD.employee_id = NEW.employee_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('mobile_devices_cap:' || NEW.employee_id::text));

  SELECT count(*) INTO approved_others
    FROM mobile_devices
   WHERE employee_id = NEW.employee_id
     AND status = 'approved'
     AND id <> NEW.id;

  IF approved_others >= 2 THEN
    RAISE EXCEPTION 'mobile_devices_employee_approved_cap'
      USING HINT = 'This employee already has 2 approved devices. Revoke one first.';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mobile_devices_cap_approved_trg ON mobile_devices;
CREATE TRIGGER mobile_devices_cap_approved_trg
  BEFORE INSERT OR UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION mobile_devices_cap_approved();

-- Still wanted: `kind` remains a real, queried column even though it no longer
-- caps anything.
CREATE INDEX IF NOT EXISTS mobile_devices_kind_idx ON mobile_devices (kind);
