# Server-load reduction preview

## Metadata

- Date: 2026-10-02
- Branch: `feature/server-load-reduction-preview`
- Base: `wms-local/main` at `95a08ad1`
- Implementation commit: `3b8cdf2f`
- Status: attendance fix and Super Admin foundation merged and validated; ready for development push and preview rebuild

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

### Clean-clone verification before development push

- `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck` — passed.
- `pnpm exec vitest run tests/unit/server-load-reduction-preview.test.ts` — passed, 4/4 tests.
- ESLint on every changed TypeScript/TSX file — passed with no findings.
- `pnpm build` — compilation and TypeScript passed; page-data collection stopped only because the clean clone has no `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `pnpm check:leaks` — passed; zero PGlite production trace references.
- Final outgoing diff review found no credentials, secrets, PII, SQL, migrations or unrelated generated files.

## Remaining work

- Push the merged branch to the development repository.
- Verify the existing Vercel branch preview updates to the merge commit.

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

### Merged-branch verification

- `pnpm.cmd exec vitest run tests/unit/server-load-reduction-preview.test.ts` — passed, 5/5 tests.
- ESLint on all navigation follow-up TypeScript and TSX files — passed with no findings.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm.cmd typecheck` — passed.
- `pnpm.cmd build` — compilation and TypeScript passed; local page-data collection stopped because the linked clone does not contain `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `pnpm.cmd check:leaks` — passed; zero PGlite production trace references.
- Merge conflict resolution retained both prior validation evidence and all navigation follow-up notes.

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
- **Testing rollout decision (2026-10-03):** apply migration 0264 and run any dry-run/backfill only against the separate test database first. Do not apply it to the production database or remove the legacy Super Admin guard until the test database grants, access checks, and rollback path have been verified.

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

### Required decisions before the next implementation phase

Do not remove the legacy Super Admin code guard or connect the Head / Associate / Developer draft to live permissions until both items below are explicitly confirmed and recorded.

1. **Separate test database:** identify and link the non-production Supabase project, then obtain approval to apply migration 0264 and run its dry-run/backfill there. Do not use the production project. Migration 0264 creates only the tables; the backfill is a separate, explicit operation.
2. **Role semantics:** confirm the exact allowed actions and data scope for each Head, Associate, and Developer assignment. The proposed safe default is:
   - Head: full module access, may manage the module team and approve; no deletion of sensitive records by default.
   - Associate: view/create/edit only within assigned scope; no deletion or approval.
   - Developer: selected pages only, view by default; edit only when explicitly granted by Super Admin.

### Next implementation sequence after approval

1. Apply migration 0264 to the separate test database; run the backfill dry-run and review only its count-based result.
2. Run the authorised backfill in that test database; verify Super Admin rows, audit events, access decisions, and rollback behaviour.
3. Replace the legacy synchronous Super Admin implementation only as part of a complete, reviewed async-guard migration. It has many current consumers; partial conversion risks unexpected 403 responses or a lockout.
4. Connect the Head / Associate / Developer design to the existing role/module-permission architecture. Do not create a parallel authorization system or grant access merely from a UI label.
5. Run focused authorization tests, typecheck, diff/PII review, then push to `feature/server-load-reduction-preview` and verify a Preview deployment.

### Test database discovery status (2026-10-03)

- Read-only Supabase project discovery found the live Altus OS project and unrelated Altus projects, but no separate Altus OS test project available to the current signed-in account.
- Do not link, migrate, or backfill the live Altus OS project for this work.
- **Cross-machine handoff:** the separate test-database work will be performed first on another machine and repository by an authorised operator. That operator must create/link the test project, apply migration 0264, run the backfill dry-run and authorised backfill, then verify grants, audit events, access decisions, and rollback.
- Only after that operator records successful verification may this branch move to the next phase: remove the legacy hardcoded Super Admin list through a complete async-guard migration, then connect the Head / Associate / Developer design to the existing permission architecture.

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

## Development merge verification (2026-10-03)

- Merged the attendance and Super Admin foundation commits into the development copy of `feature/server-load-reduction-preview` while retaining the earlier preview validation history.
- At merge-validation time, migration `0264` and both backfill modes had not been run.
- `pnpm.cmd exec vitest run tests/unit/server-load-reduction-preview.test.ts tests/unit/super-admin-database-foundation.test.ts tests/unit/super-admin.test.ts tests/unit/attendance-worker-config.test.ts tests/unit/attendance-status.test.ts` — passed, 78/78 tests.
- ESLint on all TypeScript and TSX files introduced or changed by the incoming commits — passed with no findings.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm.cmd typecheck` — passed.
- `pnpm.cmd build` — compilation and TypeScript passed; local page-data collection stopped because the linked clone lacks `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `pnpm.cmd check:leaks` — passed; zero PGlite production trace references.
- Remaining deployment step: push the merge to the development branch and verify the existing Vercel branch preview reaches Ready using project-managed preview variables.

## Live database migration execution (2026-10-03)

- The project’s Vercel Preview and Production environments share the same `DATABASE_URL`; this was identified and disclosed before execution.
- After explicit owner approval to use that shared live database, migration `0264_super_admin_grants.sql` was applied by itself in a transaction and recorded in `__schema_applied`. No other pending migration was applied.
- Post-migration verification found zero rows in both `super_admin_grants` and `super_admin_grant_events`.
- The Super Admin backfill was then run in its default dry-run mode. It resolved 3 active legacy Super Admin employee records and reported that 3 database grants need to be created.
- After a second explicit owner approval, the write-mode backfill created 3 database grants and 3 append-only `backfilled` audit events in one transaction.
- Independent read-only verification confirmed 3 unique grant employees, 3 valid employee references, 3 `backfilled` events, and no null event employee references.
- Active authorization still uses the legacy synchronous guard until the complete async-guard migration is separately reviewed and implemented; storing the grants does not by itself remove the hardcoded guard.

## Module ownership live demo (2026-10-03)

- Added a UI-only concept route at `/admin/access-architecture-demo`, linked as **Ownership Demo** under the Control Panel’s Access navigation.
- The demo models one Head as the primary module owner, one Associate as the Head’s operational replacement with the same access, and one or more Developers as technical/code owners assigned by Super Admin.
- Each page inherits its module assignment by default and can be switched to a custom page-level Head, Associate, and Developer assignment.
- Developer assignment is deliberately described as technical ownership; it does not grant business-data access or bypass existing authorization.
- All displayed people are synthetic, all interactions stay in browser memory, and no server action, permission guard, schema, migration, or database write was added.
- Validation: changed-file ESLint passed; full `pnpm typecheck` passed; environment-backed `pnpm build` passed and included the new route; `pnpm check:leaks` passed with zero watched-package leaks.
- Product decision still required after review: confirm whether module/page inheritance and the exact Head/Associate/Developer model shown in the demo match the intended operating structure before implementing persistence or authorization.

## Module ownership implementation in progress (2026-10-03)

- The approved demo has been converted locally into a database-backed Super-Admin management surface using real active employee records and the existing permission catalogue.
- Added migration `0265_module_ownership.sql` with current assignments and append-only audit events. It seeds no identities or assignments.
- Head and Associate are equivalent catalogue-level Show/View/Edit owners. The closest configured node wins, so a page assignment fully overrides its inherited module team.
- Developer remains technical ownership metadata and receives no access from the assignment.
- Existing feature-specific security checks remain additive; ownership does not bypass finance, HR, capability, row-scope, or other domain guards.
- Writes require membership in `super_admin_grants`, are rate-limited, validate active employees, prevent Head/Associate duplication, and use one transaction for replacement plus audit history.

### Validation so far

- Changed-file ESLint: passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm.cmd typecheck`: passed.
- `pnpm.cmd test tests/unit/module-ownership.test.ts tests/unit/permission-catalog.test.ts`: passed, 24/24.
- Production compilation and build TypeScript: passed. Local page-data collection cannot finish because this checkout has none of `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, or `NEXT_PUBLIC_SUPABASE_ANON_KEY`; Vercel remains the valid environment-backed build.
- `pnpm.cmd check:leaks`: passed with zero watched-package and PGlite trace leaks.

### Database execution

- The Vercel Preview Supabase URL was matched to project `fjopgyqytfvbudkwhdto` before any write. The same Vercel configuration applies to Preview and Production, so this is the shared live database previously approved for this branch.
- A read-only preflight confirmed migration 0265 was absent and the database-backed Super Admin registry contained 3 grants.
- Applied only `db/migrations/0265_module_ownership.sql` through the authenticated Supabase CLI, then recorded `0265_module_ownership.sql` in `__schema_applied`.
- Post-apply verification confirmed both ownership tables, 8 indexes/constraints, a ledger record, 0 assignment rows and 0 audit-event rows. No identities or default ownership assignments were inserted.
- Temporary Vercel environment and Supabase link files were removed after verification.

## Ownership permissions and compact directory (2026-10-03)

- Updated the confirmed role model: one optional Head with View+Edit; multiple Associates with View-only or Edit+View; multiple Developers with automatic View+Edit.
- Edit is the catalogue-level create/update/delete permission and always implies View.
- Every configured module/page now has a default visibility policy: `everyone` lets unassigned people view but not edit; `restricted` hides it from unassigned people. The closest configured page/module remains the inherited source.
- Database-backed Super Admins bypass ownership restrictions so the recovery/configuration path cannot lock itself out. Feature-specific finance, HR, capability, row-scope, and other domain checks remain additive.
- Reworked the page into a compact Module Directory based on the supplied reference: horizontal module tabs, search, dense route rows, status badges, and a focused policy editor.

### Migration 0266

- Applied only `db/migrations/0266_module_ownership_permissions.sql` to verified Supabase project `fjopgyqytfvbudkwhdto` and recorded it in `__schema_applied`.
- Existing 3 assignments were preserved and retained View+Edit, matching their pre-migration effective access.
- Removed the one-Associate unique index, added `can_view`/`can_edit` invariants, created `module_ownership_policies`, and extended audit events with previous/next visibility.
- Backfilled the one already-configured node to `everyone`, preserving its previous visibility for unassigned users. No identity or new assignment was inserted.

### Validation

- Changed-file ESLint: passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm.cmd typecheck`: passed.
- `pnpm.cmd test tests/unit/module-ownership.test.ts tests/unit/permission-catalog.test.ts`: passed, 26/26.
- Supabase verification: migration ledger present, 3 assignments preserved, old Associate uniqueness index absent, 1 `everyone` policy row.
