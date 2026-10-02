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
