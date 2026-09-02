-- Admin-driven password reset marker.
--
-- Set to now() when an admin resets an employee's password (which also
-- revokes their sessions). Cleared back to NULL on the employee's next
-- successful sign-in. While non-null it means "an admin reset this account
-- and the employee hasn't signed in since" — the trigger for the specific
-- "your password was changed by an administrator" login message.
--
-- Idempotent: add-column-if-not-exists, so applying twice is a no-op.

alter table employees
  add column if not exists password_reset_by_admin_at timestamptz;
