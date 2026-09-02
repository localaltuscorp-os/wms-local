-- Trim notification emails to stop Resend quota exhaustion.
--
-- Email is kept only for task_assigned (per-event) and overdue_digest (daily).
-- Every other task notification becomes inbox-only: an empty channel array
-- means resolveChannels() returns no outbound channels, while notifyImpl still
-- always inserts the in-app inbox row first. Auth-flow emails (forgot password,
-- reset, invite credentials) bypass this matrix and are unaffected.
--
-- Applies to BOTH the live single-row org_settings (id = 1) AND the column
-- default for fresh installs.
--
-- Idempotent: the update is a full overwrite of the column; the default set is
-- declarative. Re-running yields the same state.

update org_settings
set notification_matrix = '{
  "task_assigned":   ["email"],
  "task_initiated":  [],
  "status_changed":  [],
  "approved":        [],
  "declined":        [],
  "reassigned":      [],
  "transferred":     [],
  "cancelled":       [],
  "commented":       [],
  "overdue_digest":  ["email"]
}'::jsonb;

alter table org_settings
  alter column notification_matrix set default '{
    "task_assigned":   ["email"],
    "task_initiated":  [],
    "status_changed":  [],
    "approved":        [],
    "declined":        [],
    "reassigned":      [],
    "transferred":     [],
    "cancelled":       [],
    "commented":       [],
    "overdue_digest":  ["email"]
  }'::jsonb;
