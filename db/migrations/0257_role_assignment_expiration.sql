-- 0257 — Optional expiry for a person's assignment to a reusable role.
-- NULL is deliberately "never": existing access remains unchanged on rollout.

ALTER TABLE employee_roles
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS employee_roles_expires_at_idx
  ON employee_roles (expires_at)
  WHERE expires_at IS NOT NULL;
