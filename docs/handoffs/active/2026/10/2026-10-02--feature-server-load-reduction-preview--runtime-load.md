# Server-load reduction preview

## Metadata

- Date: 2026-10-02
- Branch: `feature/server-load-reduction-preview`
- Base: `wms-local/main` at `95a08ad1`
- Implementation commit: `3b8cdf2f`
- Status: implementation under validation

## Objective

Create a testable preview that lowers avoidable Vercel and Supabase runtime work while leaving authentication, permissions and production untouched.

## Summary

- Paused 12 approved Vercel schedules by removing only their `vercel.json` entries.
- Kept every cron route handler, allowing manual execution and easy schedule restoration.
- Replaced per-indicator task Realtime channels with one shared React context provider.
- Coalesced task-triggered full server refreshes into at most one every 20 seconds per browser tab.
- Increased low-risk activity-log batches from 20 to 50 and periodic flush from 30 seconds to 2 minutes.
- Added a 30-second per-user cache for navigation unread counts. Direct Inbox/mobile reads remain uncached.
- Fixed pre-existing Client Engagement product-option prop wiring that blocked the development base from typechecking and therefore blocked preview builds.

## Files and components changed

- `vercel.json`
- `app/(app)/layout.tsx`
- `components/layout/task-realtime-provider.tsx`
- `components/layout/live-indicator.tsx`
- `components/layout/notification-bell.tsx`
- `lib/logs/client-tracker.ts`
- `lib/queries/nav-counts.ts`
- `lib/queries/notifications.ts`
- `tests/unit/server-load-reduction-preview.test.ts`
- `components/client-engagement/accounts-table-pane.tsx`
- `components/client-engagement/accounts-board.tsx`
- `components/client-engagement/pca-grid.tsx`
- `app/(app)/operations/client-engagement/pca/page.tsx`

## Database and migrations

None. No schema or production data changes.

## Authentication and authorization

None. Proxy, Firebase session validation, two-step checks, permissions and API guards are unchanged.

## Expected impact

- One task Realtime subscription per app tree instead of one per visible indicator.
- A burst of task mutations causes at most one full refresh per 20 seconds per tab.
- Fewer `/api/logs/ingest` requests from active browser sessions.
- At most one unread-count database query per user per 30-second cache window for shared chrome.
- 12 fewer scheduled Vercel workflows; their business output will not occur automatically in this preview.

## Known risks and rollback

- Task changes may take up to 20 seconds to appear through the shared refresh.
- Navigation unread badges may lag by up to 30 seconds; Inbox/mobile direct counts remain current.
- Paused backup, HR, compliance and reporting schedules will not run automatically. This branch is for preview testing and must not be promoted without owner approval.
- Rollback by reverting this isolated commit or restoring the removed schedule entries.

## Validation

- `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit` — passed after the pre-existing Client Engagement prop wiring was corrected.
- Focused Vitest: 4/4 tests passed.
- ESLint on all changed TypeScript/TSX files — passed.
- `git diff --check` — passed.
- `pnpm build` — compilation and TypeScript passed; local page-data collection stopped because the isolated worktree intentionally has no `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Vercel preview must confirm the complete build with project environment variables.
- `pnpm check:leaks` — passed; zero PGlite production trace references.

## Remaining work

- Review the final diff for unrelated changes and sensitive data.
- Commit and push to the development repository.
- Create and verify a Vercel preview deployment.

## Navigation and stalled-loading follow-up

### Summary

- Deduplicated responsive navigation data into one request-scoped snapshot, so desktop and mobile variants share the same work during a server render.
- Loaded independent navigation reads concurrently instead of serially.
- Added five-second fallbacks for non-critical navigation badges and visibility hints, preventing an optional chrome read from holding the complete page open on a stale pooled connection.
- Added request-scoped deduplication for workspace access and direct-report lookups. No authorization or employee data is cached across requests.
- Added a manual `Reload page` action after a loading boundary has remained visible for 12 seconds. It does not auto-reload and cannot create a reload loop.

### Files

- `components/layout/main-nav-server.tsx`
- `components/layout/loading-recovery.tsx`
- `app/loading.tsx`
- `app/(admin)/admin/loading.tsx`
- `lib/auth/workspace-access.ts`
- `lib/productivity/access.ts`
- `tests/unit/server-load-reduction-preview.test.ts`

### Behavior and risk

- Server-side route authorization remains authoritative and unchanged.
- If a non-critical navigation read times out, a badge or optional menu hint may be absent for that render; protected pages still enforce access independently.
- Authentication, salary data, schema, migrations, and production data are unchanged.

### Validation

- `pnpm.cmd exec vitest run tests/unit/server-load-reduction-preview.test.ts` - 5/5 passed.
- ESLint on all follow-up TypeScript and TSX files - passed.
- `node --max-old-space-size=4096 node_modules\\typescript\\bin\\tsc --noEmit` - passed.
- `git diff --check` - passed.

### Security review note

- A pre-existing identity-based allow-list was found in `lib/hh/access.ts` while tracing a navigation consumer. It is outside this performance diff and was not modified. Migrate it separately to the established role/capability model after the feature owner confirms the intended business rule; do not copy identity values into a handoff or replacement implementation.

## Separate Super Admin database foundation

### Objective and status

- Added the background-only database foundation for a Super Admin role that is separate from the existing Master Admin capability.
- No page, route, navigation item, permission decision, production database, or existing Master Admin behavior changed in this branch.
- Existing synchronous Super Admin checks remain in place until a separately reviewed async-guard migration can be completed safely.
- Implementation commit: `6c9295be` (`feat: add super admin database foundation`), pushed to `altus-os-fork/feature/server-load-reduction-preview`.

### Files

- `db/migrations/0264_super_admin_grants.sql`
- `db/schema.ts`
- `lib/security/super-admin-grants.ts`
- `scripts/backfill-super-admin-grants.ts`
- `tests/unit/super-admin-database-foundation.test.ts`
- `package.json`

### Database and migration information

- Migration 0264 adds `super_admin_grants` and append-only `super_admin_grant_events`.
- It creates no memberships and contains no employee identities.
- Present membership uses `ON DELETE RESTRICT`; audit evidence uses `ON DELETE SET NULL`.
- The controlled backfill command is dry-run by default. It must only run after 0264 is reviewed and applied by an authorised database operator. It refuses incomplete legacy resolution and reports counts only.

### Access and rollout considerations

- Super Admin remains separate from `capability_grants` and `master_admin.manage`.
- The existing Control Panel and Master Admin behaviors are unchanged.
- The new server-only grant helper protects the last database-backed Super Admin from revocation, but has no UI or route yet.
- Do not remove the legacy synchronous Super Admin guard or run the backfill until a planned, tested transition covers its current synchronous consumers.

### Validation

- `pnpm.cmd exec vitest run tests/unit/super-admin-database-foundation.test.ts tests/unit/super-admin.test.ts` — 13/13 passed.
- `pnpm.cmd exec eslint db/schema.ts lib/security/super-admin-grants.ts scripts/backfill-super-admin-grants.ts tests/unit/super-admin-database-foundation.test.ts` — passed.
- `node --max-old-space-size=4096 node_modules\\typescript\\bin\\tsc --noEmit` — passed.

### Rollback

- Before migration application: revert the feature commit.
- After migration application but before any backfill: leave the tables unused or deploy a forward migration only if removal is specifically approved.
- No production rollback is required for this branch because no production migration or backfill was executed.

### Preview deployment

- A manual non-production Vercel Preview was created at `https://altus-5svc2l7gb-altus-corp1.vercel.app`.
- At the last check it remained `UNKNOWN` with a `0ms` build record; it is not Ready and must not be treated as testable. No production deployment was created or changed.

## Attendance canonical-day follow-up

### Summary

- Attendance grading now groups a punch by its persisted `attendance_logs.log_date`, which is the business date selected when the punch was recorded.
- Timestamp-to-timezone conversion now supplies only the displayed clock time. It can no longer move a historic punch to an adjacent calendar day and split an in/out pair across two grades.
- Added a regression for a hybrid worker with paired 13:20 to 19:55 punches: 395 worked minutes and `Present`.

### Database and deployment

- No database rows, settings, migrations, or production data were changed.
- This is a live-calculation fix: after deployment, historical attendance is recalculated from existing punch rows.

### Validation

- `pnpm.cmd exec vitest run tests/unit/attendance-worker-config.test.ts tests/unit/attendance-status.test.ts` - 60/60 passed.
- ESLint on changed files - passed.
- `node --max-old-space-size=4096 node_modules\\typescript\\bin\\tsc --noEmit` - passed.
- `git diff --check` - passed.
