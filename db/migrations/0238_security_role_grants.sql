-- 0238 — ASSIGNABLE SECURITY ROLES.
--
-- ── WHY A NEW TABLE, AND NOT ONE OF THE THREE THINGS WE ALREADY HAVE ───────
--
--   · `module_permissions` (0219) is a RESTRICT system: with no row, the
--     resolver answers allowAll(). Hanging "may unlock accounts" off it would
--     mean everyone can unlock until somebody is explicitly switched off, which
--     is the exact opposite of the requirement.
--   · `lib/security/capabilities.ts` grants by email IN CODE. Correct for
--     capabilities that must not move without a code review, but it means a
--     developer and a deploy every time somebody new should be able to unlock.
--   · `employees.is_admin` is one flag covering everything an admin can do, and
--     the four people named for unlocking are not the same set as the admins
--     (Jeevan is not an admin; Om, Rutvisha, Shreya and Vinal are).
--
-- So: the ROLE LIST LIVES IN CODE (lib/auth/security-roles-catalog.ts, so every
-- role is one a route actually enforces) and the GRANTS LIVE HERE, so an
-- existing holder can give the role to somebody new from the app — no deploy.
-- Same split the permission catalogue documents for itself: tree in code,
-- grants in data.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Additive: one table, one audit table, and the four addresses the requirement
-- named seeded as holders of `account_unlock` so behaviour does not regress on
-- deploy. Idempotent — safe to run twice. A seeded row is matched by email, so
-- an address with no employees row yet is simply skipped.

CREATE TABLE IF NOT EXISTS security_role_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Matches a key in lib/auth/security-roles-catalog.ts. Text, not an enum:
  -- adding a role should not need a migration, and a key with no code behind it
  -- grants nothing because only a route's own check consults it.
  role          text NOT NULL,
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_role_grants_employee_role_uniq UNIQUE (employee_id, role)
);

CREATE INDEX IF NOT EXISTS security_role_grants_role_idx
  ON security_role_grants (role);

-- Who gave or took away a role, and when. Separate from the grant itself so
-- revoking does not erase the history of having held it.
CREATE TABLE IF NOT EXISTS security_role_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  role          text NOT NULL,
  -- 'granted' | 'revoked'
  action        text NOT NULL,
  actor_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_role_events_action_chk CHECK (action IN ('granted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS security_role_events_role_idx
  ON security_role_events (role, occurred_at DESC);

-- Seed the four the requirement named. Matched by app login email, lower-cased.
INSERT INTO security_role_grants (employee_id, role)
SELECT e.id, 'account_unlock'
  FROM employees e
 WHERE lower(e.email) IN (
         'mohitgupta.altuscorp@gmail.com',
         'rohanchoudhary.altuscorp@gmail.com',
         'jeevanbharambe.altuscorp@gmail.com',
         'manan@unleashed.in'
       )
ON CONFLICT (employee_id, role) DO NOTHING;

ALTER TABLE security_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_events ENABLE ROW LEVEL SECURITY;
