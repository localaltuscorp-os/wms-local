# SQL Migrations Required Before Deploying This Branch

> **⚠️ Run these in your Supabase SQL Editor BEFORE deploying the code from this
> branch, or broadcast-related queries will fail at runtime.**

## Migration: `db/migrations/0215_broadcast_popup_snooze.sql`

**What it does:** Adds four columns to `broadcast_recipients` (snooze tracking
for the centre-screen popup), one column to `broadcasts` (popup on/off toggle),
and one index for the popup poller query.

**Is it safe?** Yes — every statement uses `IF NOT EXISTS` / `ADD COLUMN IF NOT
EXISTS`, so re-running it is harmless. It is purely additive; no existing data is
modified or deleted.

### Run this in Supabase SQL Editor:

```sql
-- 0215 — Broadcasts: the centre-screen popup + its snooze.

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_session text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS popup_seen_at timestamptz;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS broadcast_recipient_popup_idx
  ON broadcast_recipients(employee_id, status, snoozed_at);
```

### How to verify it worked:

```sql
-- Should return snoozed_at, snooze_session, snooze_count, popup_seen_at
SELECT column_name FROM information_schema.columns
WHERE table_name = 'broadcast_recipients'
  AND column_name IN ('snoozed_at','snooze_session','snooze_count','popup_seen_at');

-- Should return popup
SELECT column_name FROM information_schema.columns
WHERE table_name = 'broadcasts' AND column_name = 'popup';

-- Should return broadcast_recipient_popup_idx
SELECT indexname FROM pg_indexes
WHERE tablename = 'broadcast_recipients'
  AND indexname = 'broadcast_recipient_popup_idx';
```

---

## No other migrations are required from this push.

All other changes in this branch (HR letters, communications, layout, login UI)
are code-only and do not touch the database schema.
