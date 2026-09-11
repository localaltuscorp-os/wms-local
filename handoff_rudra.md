# Handoff — Rudra's Push Notes (2026-09-10)

> These are Rudra's additions for the push to branch `Rudra`. The main changelog
> entry for today's work is already in `HANDOFF.md` (written during the three
> sessions). This file captures the push-specific notes that the team needs.

---

## Changes to HANDOFF.md

Three small edits were made to the main `HANDOFF.md`:

1. **Current state date** updated from `2026-09-08` to `2026-09-10`.
2. **Scale line** updated from `212 migrations` to `215 migrations` (migration
   0215 added in this push).
3. **Migration section** of the 2026-09-10 changelog entry: added a reference
   to `docs/SQL_QUERIES_FOR_DEPLOY.md` and a caveat that all testing was against
   DUMMY_MODE.

---

## 🗄️ DATABASE CHANGES — READ THIS FIRST

> **All three active sessions today are documented here with their database
> impact, so your superior knows exactly what touches the database.**

### Session 1 — ECOS Broadcast Popup + Snooze

**This session has database changes.**

- **Migration `db/migrations/0215_broadcast_popup_snooze.sql`** — must be
  applied to the target Supabase database BEFORE deploying. Adds:
  - 4 columns to `broadcast_recipients`: `snoozed_at`, `snooze_session`,
    `snooze_count`, `popup_seen_at`
  - 1 column to `broadcasts`: `popup` (boolean, default true)
  - 1 index: `broadcast_recipient_popup_idx`
  - All statements are idempotent (`IF NOT EXISTS`). Safe to re-run.

- **`db/schema.ts`** — Drizzle schema updated with declarations for the 5 new
  columns and 1 new index. These MUST match the database after 0215 is applied.

- **`lib/ecos/queries.ts`** — New database queries added:
  - `nextPopupBroadcastForEmployee()` — **polled every ~5 seconds on every
    authenticated page**. Queries `broadcast_recipients` joined with
    `broadcasts` for popup-eligible pending receipts. Uses the new columns
    `snooze_session`, `snoozed_at`, and `popup`.
  - `getBroadcastAnalytics()` — Aggregates snooze counts across
    `broadcast_recipients` for the dashboard. Reads `snooze_count`.
  - Snooze action — Updates `broadcast_recipients.snooze_session`,
    `snoozed_at`, `snooze_count` when a user dismisses a popup.
  - Read/acknowledge action — Updates `broadcast_recipients.popup_seen_at`
    when a user reads from the popup.

- **`app/api/broadcasts/popup/route.ts`** — New API endpoint that calls
  `nextPopupBroadcastForEmployee()`. Polled by the client.

### Session 2 — HR Letters Overhaul

**No database changes.** All modifications are code-only (letter editor,
PDF pipeline, letterhead, HR console navigation).

### Session 3 — Communications, Login, Layout, Build

**No database changes.** Communications inbox improvements, HR communication
actions, login UI, layout shell, and `next.config.ts` Turbopack root fix are
all code-only.

---

## SQL Queries the Team Must Run

> **⚠️ Run these in your Supabase SQL Editor BEFORE deploying code from this
> branch, or broadcast-related queries WILL FAIL at runtime.**

### File: `db/migrations/0215_broadcast_popup_snooze.sql`

```sql
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_session text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS popup_seen_at timestamptz;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS broadcast_recipient_popup_idx
  ON broadcast_recipients(employee_id, status, snoozed_at);
```

### Verification queries:

```sql
-- Should return: snoozed_at, snooze_session, snooze_count, popup_seen_at
SELECT column_name FROM information_schema.columns
WHERE table_name = 'broadcast_recipients'
  AND column_name IN ('snoozed_at','snooze_session','snooze_count','popup_seen_at');

-- Should return: popup
SELECT column_name FROM information_schema.columns
WHERE table_name = 'broadcasts' AND column_name = 'popup';

-- Should return: broadcast_recipient_popup_idx
SELECT indexname FROM pg_indexes
WHERE tablename = 'broadcast_recipients'
  AND indexname = 'broadcast_recipient_popup_idx';
```

Also available as a standalone doc: **`docs/SQL_QUERIES_FOR_DEPLOY.md`**

---

## Files NOT Committed (Intentional)

- `.pglite.corrupt-20260910-172348/` — untracked test artifact
- `bc-e2e.tmp.mjs` — untracked test artifact

Neither is gitignored. Do not commit them.

---

## Caveats

- **All testing was against DUMMY_MODE with the rebuilt fixture DB.** A pass
  against the real database and real auth is recommended before merging to main.
- The `pnpm build` script uses `rm -rf` which fails on Windows; the build was
  verified by running `npx next build --webpack` directly (passed clean).
- The `next.config.ts` change (Turbopack root pinning) only affects `next dev`.
  The production build uses webpack and is unaffected.

---

## Commit

- **Hash:** `5eabec6`
- **Branch:** `Rudra`
- **Remote:** `localaltuscorp-os/wms-local`
- **Files:** 47 changed, +3,971 / -406
