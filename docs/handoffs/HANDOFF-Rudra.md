# HANDOFF — `Rudra` branch

**Date:** 2026-09-10 (merged with `main` 2026-09-11)
**Branch:** `Rudra` → `https://github.com/localaltuscorp-os/wms-local`
**Audience:** whoever picks this up next, and the Supabase owner who has to run the SQL.

> Structure follows [`HANDOFF-Om.md`](../../HANDOFF-Om.md). Note that Om's lives at the
> repo root while this one lives here — the two conventions should be reconciled; this
> file is in `docs/handoffs/` because that is where it was asked to go.

---

## 1. Run this SQL in Supabase — the short version

**One migration ships on this branch:** `0215_broadcast_popup_snooze.sql`.

**Nothing here is destructive.** Every statement is `ADD COLUMN IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS`. No existing row is read, modified or deleted, and re-running
it is harmless.

Open Supabase → SQL Editor → New query → paste → Run:

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

Two notes for whoever runs it:

- `ADD COLUMN ... NOT NULL DEFAULT true` does **not** rewrite the table on PG 11+, so it
  is fast even on a large `broadcasts`.
- `CREATE INDEX` is **not** `CONCURRENTLY`, so it takes a brief write lock on
  `broadcast_recipients`. Negligible at current row counts; switch to `CONCURRENTLY`
  (outside a transaction) if that table has grown.

> ⚠️ **This is not the only SQL outstanding.** `main` also carries `0216`–`0220` from the
> `Om` branch, bundled in [`db/RUN-IN-SUPABASE-0216-0220.sql`](../../db/RUN-IN-SUPABASE-0216-0220.sql).
> Run those too — see [`HANDOFF-Om.md`](../../HANDOFF-Om.md) §1. A copy-paste version of
> `0215` alone also lives in [`docs/SQL_QUERIES_FOR_DEPLOY.md`](../SQL_QUERIES_FOR_DEPLOY.md).

---

## 2. The migration, by file

| File | Adds |
|---|---|
| `db/migrations/0215_broadcast_popup_snooze.sql` | `broadcast_recipients.snoozed_at`, `.snooze_session`, `.snooze_count`, `.popup_seen_at`; `broadcasts.popup`; index `broadcast_recipient_popup_idx` |

`db/schema.ts` declares exactly these five columns and this index. **Schema and database
must agree** — applying `0215` is what makes them agree. Deploying the code without it
means every broadcast query references columns that do not exist.

---

## 3. Why not just `npm run db:migrate`

Same reasoning as Om's §3: the runner replays the whole chain, and the chain cannot
currently rebuild the database from scratch (see `HANDOFF.md` → Known issues → 1). Applying
this one file by hand in the SQL Editor is the safe path for an already-live database.

---

## 4. Verify it worked

```sql
-- Should return 4 rows: snoozed_at, snooze_session, snooze_count, popup_seen_at
SELECT column_name FROM information_schema.columns
WHERE table_name = 'broadcast_recipients'
  AND column_name IN ('snoozed_at','snooze_session','snooze_count','popup_seen_at');

-- Should return 1 row: popup
SELECT column_name FROM information_schema.columns
WHERE table_name = 'broadcasts' AND column_name = 'popup';

-- Should return 1 row: broadcast_recipient_popup_idx
SELECT indexname FROM pg_indexes
WHERE tablename = 'broadcast_recipients'
  AND indexname = 'broadcast_recipient_popup_idx';
```

---

## 5. What shipped on this branch

- **ECOS broadcast popup + snooze** — `components/ecos/broadcast-popup.tsx`,
  `lib/ecos/{queries,permissions,media,labels,browser-session}.ts`,
  `app/api/broadcasts/popup/route.ts`. A published broadcast flashes centre-screen within
  ~5s. "Read" settles the receipt; the "✕" snoozes it until the recipient's next login,
  keyed on an opaque browser-session id. Deliberately skips lock-mode broadcasts so it can
  never fight with `components/communications/broadcast-lock-gate.tsx`.
- **WhatsApp manual-send panel** — `components/ecos/whatsapp-panel.tsx` (see §7).
- **HR letters overhaul** — `components/hr/letters/*`, `components/hr/letterhead/*`,
  `lib/hr/letters/{issue-core,pdf,render-rich,rich,roster}.ts`,
  `app/api/hr/letters/pdf/route.ts`, `scripts/letter-page-estimate.ts`.
- **HR console chrome** — `components/layout/inset-top-bar.tsx` (new),
  `components/layout/chrome-shell.tsx`, `components/hr/console/hr-console-shell.tsx`. The
  app top bar was a full-width strip sitting *on top of* the HR console's own rail — the
  one module that didn't match the rest. It now renders inside the console's content
  column, so the rail runs the full viewport height like every other module's.
- **Turbopack workspace root pinned** — `next.config.ts`. A stray empty
  `package-lock.json` in the Windows home folder out-ranked this repo's `pnpm-lock.yaml`,
  so Turbopack rooted the module graph at the home directory and watched the whole user
  profile, producing phantom "export doesn't exist" errors. `next dev` only; the
  production build uses webpack.
- **Dummy sandbox is HR staff by seed** — `scripts/dummy-db-seed.ts` (see §6).

---

## 6. Decisions made during the merge — please sanity-check

1. **`tests/unit/hr-intake-grantees.test.ts` — kept both sides.** This branch and `main`
   each added tests for the same invariant from opposite directions: ours asserts
   super-admin ⇏ HR intake, `main`'s asserts HR intake ⇏ super-admin. They are
   complementary, so both were kept and the two overlapping "Rohan holds both grants"
   tests were merged into one. 8 tests pass.
2. **`HANDOFF.md` — kept both changelog entries.** Both sides added a `2026-09-10` entry
   for different work. Ours is listed first, `main`'s second.
3. **The dummy admin is now seeded into an `HR` department.** This used to be a manual
   `UPDATE` run against `.pglite` by hand, so it vanished on every
   `pnpm dummy:setup --reset` and every `/hr/*` sub-page silently redirected back to
   `/hr` — which looks exactly like broken navigation. `requireHrStaff()` admits
   super-admins and members of a department named **`HR`** only; `is_admin` does not
   count, and `matchesDepartment()` splits on non-letters looking for the token `hr`, so
   "Human Resources" would **not** match. The seed sets both sources it reads: the
   `department` text column and `employee_departments` membership.
4. **Broadcast authoring is open to every signed-in employee.** `requireAuthor()` is just
   `requireUser()`. Managing an *existing* broadcast correctly requires author-or-admin
   (`requireManager`), but creation is not gated — and broadcasts support
   Critical/Emergency priority with app-lock mode. **Please confirm this is intended.**

---

## 7. Known issues

### 7.1 `.gitignore` swallowed a source file — third occurrence

`components/ecos/whatsapp-panel.tsx` was written and imported by
`app/(app)/communications/[id]/page.tsx`, but `git add -A` skipped it silently, so the
branch shipped an import of a file that was never pushed and failed to resolve at build
time. Cause: `.gitignore` line 58 is `WhatsApp*`, intended for media exports; on
Windows/macOS the filesystem is case-insensitive so it also matched `whatsapp-panel.tsx`.
The override list already carried `!lib/**/whatsapp*`, `!app/api/whatsapp/` and
`!tests/unit/whatsapp-*.test.ts` — each added after this same trap bit — but never
`components/`. Fixed by `!components/**/whatsapp*` (also on `main` in `69fef2c`).

**If you add a `whatsapp*` source file anywhere new, run `git check-ignore -v` on it before
committing.** To audit a branch for this class of bug, resolve every `@/` import against
`git ls-files` rather than the working tree — the working tree still has the file, which is
exactly why it looks fine locally. Last audit: 2,568 tracked source files, zero unresolved.

### 7.2 Duplicate migration prefix — `0215`

Extends Om's list in [`HANDOFF-Om.md`](../../HANDOFF-Om.md) §7. After this merge:

- `0215_broadcast_popup_snooze.sql` (this branch), `0215_device_access_and_attendance_audit.sql` (`main`)

The runner orders by full filename, so ordering is deterministic but alphabetical within
the prefix. The two do not touch the same tables, so there is no dependency today. Worth
renumbering before the next batch.

### 7.3 Nine pre-existing unit-test failures

`super-admin`, `roster-permission`, `done-on-time`, `task-actions`,
`global-search-provider`, `task-stat-counts`. **Not caused by this branch** — verified by
running the same files at `bd20607`, before this work, where they fail identically. They
are red and someone should own them.

### 7.4 Testing was against `DUMMY_MODE` only

All verification ran against the rebuilt PGlite fixture DB on port 3002. There has been no
pass against the real database with real auth.

`pnpm build` also uses `rm -rf`, which fails on Windows; the build was verified with
`npx next build --webpack` directly.

### 7.5 Local dev can silently run against the production database

`pnpm dev` (port **3000**) does not set `DUMMY_MODE`, so it uses the real `DATABASE_URL`
from `.env.local` — the live Supabase — while `DISABLE_AUTH="true"` and `DEV_USER_EMAIL`
resolve every request to that named employee's **real** row. Sign Out appears broken in
that mode because identity is recomputed from an environment variable per request, so
there is no session to clear. This happened on 2026-09-10; rows written while browsing are
real production data attributed to that user, and `event_log` (`actor_id`, `event_type`,
`occurred_at`) can list exactly what was written.

**Rule of thumb: port 3002 is the sandbox, port 3000 is production data.**

### 7.6 The PGlite fixture DB corrupts on a hard kill

Force-killing the dev server breaks `.pglite`; the symptom is *every* query failing,
including trivial ones like `select distinct "subject" from "tasks"` — which looks like a
schema problem and is not. Fix: `pnpm dummy:setup --reset`, then restart.
