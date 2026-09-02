-- 0185 — Task Reminder Settings: admin-authored daily reminder rules.
--
-- Admins define any number of rules. Each one names its own RECIPIENTS (who
-- gets the mail), an employee SCOPE (everyone, or a chosen list), the task
-- STATUSES that count, and its OWN daily send time. At that time the rule
-- collects every matching incomplete task and sends ONE consolidated email per
-- recipient, grouped by employee.
--
-- Design notes:
--
--   · recipient_ids / employee_ids / statuses are jsonb arrays rather than join
--     tables. A rule is a small admin-authored config document read in full on
--     every dispatch and never queried BY its members, so three join tables
--     would buy nothing and cost three writes per edit. Mirrors the existing
--     `excluded_names` jsonb on the incentive settings.
--
--   · send_time_ist is "HH:MM" TEXT in IST, not a `time` column. The cron fires
--     on a fixed schedule and compares wall-clock strings; storing a timestamp
--     would invite a UTC/IST conversion at every read, which is exactly the bug
--     class this avoids. The whole org is IST (no DST), same assumption the
--     digest cron's `digest_hour_ist` already makes.
--
--   · last_sent_on is the "YYYY-MM-DD" IST date this rule last dispatched. It
--     is the idempotency guard: the dispatcher runs every 15 minutes and fires
--     a rule when the clock has passed its send time AND it has not already run
--     today. That also means a missed window (deploy, outage) still catches up
--     on the next tick instead of silently skipping the day.
--
-- FULLY IDEMPOTENT (IF NOT EXISTS everywhere) — the drizzle journal in this repo
-- is out of sync, so migrations are applied by running this SQL directly.

CREATE TABLE IF NOT EXISTS task_reminder_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  is_enabled     boolean NOT NULL DEFAULT true,

  -- Who receives the mail.
  recipient_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Whose tasks are collected: 'all' | 'selected'. When 'selected',
  -- employee_ids is the chosen roster; ignored entirely when 'all'.
  scope          text NOT NULL DEFAULT 'all',
  employee_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Task statuses that count. Holds task_status values PLUS the pseudo-token
  -- 'overdue', which is not a status at all but a derived condition
  -- (due_at < now). It lives in the same array because that is how an admin
  -- thinks about it — one checklist of "what should be chased".
  statuses       jsonb NOT NULL DEFAULT '["dont_know","not_started","initiated","overdue"]'::jsonb,

  -- Daily send time, "HH:MM" in IST.
  send_time_ist  text NOT NULL DEFAULT '09:30',

  -- Dispatch bookkeeping (see the note above).
  last_sent_on   text,
  last_run_at    timestamptz,
  last_error     text,

  created_by_id  uuid REFERENCES employees (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The dispatcher's only query: enabled rules, in send-time order.
CREATE INDEX IF NOT EXISTS task_reminder_rules_enabled_idx
  ON task_reminder_rules (is_enabled, send_time_ist);
