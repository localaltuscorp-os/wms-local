-- 0215 — Broadcasts: the centre-screen popup + its snooze.
-- Additive + idempotent.
--
-- A published broadcast now FLASHES as a modal in the middle of the app within
-- ~5s of being sent (a client poller looks for the next popup-eligible one).
-- The recipient closes it two ways, and the difference is the whole point:
--   • the "Read" button  → receipt goes to read/acknowledged, it never returns.
--   • the "X" top-right  → SNOOZED. It comes back at the recipient's NEXT LOGIN.
--
-- "Next login" is tracked by `snooze_session`: the browser tab mints an opaque
-- session id in sessionStorage (cleared when the tab closes and by the login
-- screen). The popup query re-shows a snoozed broadcast as soon as the id it is
-- asked with differs from the one stored here. `snooze_count` is analytics —
-- how many times a message was waved away before it was actually read.

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_session text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS popup_seen_at timestamptz;

-- Per-broadcast opt-out of the popup (default ON — a broadcast is meant to be
-- seen). A low-priority FYI can be sent to the inbox + email only.
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT true;

-- The popup poller runs on every authed page for every user, so its query gets
-- its own index: "my receipts that are still pending", newest first.
CREATE INDEX IF NOT EXISTS broadcast_recipient_popup_idx
  ON broadcast_recipients(employee_id, status, snoozed_at);
