-- 0038 — notification_preferences
-- Per-user, per-(kind, channel) override matrix. When a row is absent
-- for a given (employee_id, kind, channel) tuple, the dispatcher falls
-- back to the legacy employees.email_opt_in / slack_opt_in / whatsapp_opted_in
-- scalars for that channel.
--
-- Kinds (9): task_assigned, task_initiated, status_changed, approved,
--            declined, reassigned, transferred, cancelled, commented.
-- Channels (4): email, slack, whatsapp, push.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  channel     text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, kind, channel)
);

CREATE INDEX IF NOT EXISTS notification_preferences_employee_idx
  ON notification_preferences (employee_id);

-- Profile v2 — mention escalation override (employees-row scalar so
-- dispatch reads it as part of the existing per-recipient lookup).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS mention_escalation boolean NOT NULL DEFAULT true;
