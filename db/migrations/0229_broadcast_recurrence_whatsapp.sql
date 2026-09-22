-- 0229 — Broadcasts: annual + custom-date repeats, on-time publishing, automatic WhatsApp.
-- Additive + idempotent.
--
-- recurrence_dates   The instants a "custom" repeat goes out on (ISO strings).
--                    `recurrence` is plain text with no CHECK (0180), so the two
--                    new values, "annually" and "custom", need no constraint work.
-- recurrence_anchor  The first send of a monthly / annual repeat. Its day of the
--                    month is kept, so 31 Jan → 28 Feb → 31 Mar instead of
--                    drifting to the 28th for good.
-- publish_claimed_at Set while a sweep publishes a due broadcast. Scheduled sends
--                    are now picked up within about a minute (the popup poll
--                    triggers a sweep), so several sweeps can run at once; the
--                    claim is what stops two of them publishing the same one.
-- channel_outcomes   Per recipient, per channel: what happened. Today only
--                    WhatsApp — {"whatsapp":{"status":"sent|skipped|failed",...}}.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recurrence_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recurrence_anchor timestamptz;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz;

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS channel_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The sweep asks "anything scheduled and due?" on every run.
CREATE INDEX IF NOT EXISTS broadcasts_due_idx ON broadcasts (scheduled_for) WHERE status = 'scheduled';
