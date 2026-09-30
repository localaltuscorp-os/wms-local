# Dropdown configuration explorer

- Date: 2026-09-30
- Work item: Dropdown configuration explorer
- Status: Ready to commit and push on `Om`

## Objective

Replace the existing Drop Down Master launcher with a compact Admin Panel
configuration explorer. It must only organize existing configuration pages.

## Changes

- Replaced the old module launcher with five fixed categories: People,
  Attendance, Masters, Billing, and HR.
- Added a compact explorer rail and synchronized category windows. An idle
  window shows only its category title. Hover or keyboard focus hides that title
  and shows equal-height clickable option rows.
- Every option links to its pre-existing route. No destination page, server
  action, CRUD path, validation, permission node, or data source changed.
- Added a top-level `Dropdown` Admin navigation item and removed only the
  duplicate configuration links from the Admin rail. Employees, Employee
  Master, Reporting Hierarchy, and Upload Master remain outside Dropdown.
- Preserved the restricted Clients and Subjects rail for roster-only users.

## Latest refinement

- Changed only `components/admin/drop-down-master-explorer.tsx` and its focused
  unit test.
- The left rail is now an IDE-style tree: `Dropdown` is its collapsible root,
  and categories expand independently without hiding sibling categories.
- Existing child pages remain their existing route links. The right-side
  windows remain a static launcher and retain their hover/focus option reveal.
- Added transparent internal tints without gradients: People is red; the other
  windows use blue, amber, violet, and green. Their corners are now 28px.
- No data, CRUD, route, permission, backend, or database behavior changed.

## Files

- `app/(admin)/admin/drop-down-master/page.tsx`
- `components/admin/drop-down-master-explorer.tsx`
- `components/admin/admin-nav-config.ts`
- `components/admin/roster-nav.ts`
- `lib/admin/drop-down-master.ts`
- `tests/unit/drop-down-master.test.ts`
- `tests/unit/functions-rename.test.ts`

## Database and access impact

None. The workspace is routing metadata and presentation only. Existing page
guards remain authoritative, including route-specific permission checks.

## Verification

- `node node_modules/vitest/vitest.mjs run tests/unit/drop-down-master.test.ts tests/unit/functions-rename.test.ts` — 28 passed
- `node node_modules/eslint/bin/eslint.js components/admin/admin-nav-config.ts components/admin/drop-down-master-explorer.tsx components/admin/roster-nav.ts 'app/(admin)/admin/drop-down-master/page.tsx' lib/admin/drop-down-master.ts tests/unit/drop-down-master.test.ts tests/unit/functions-rename.test.ts` — passed
- `node node_modules/typescript/bin/tsc --noEmit` — passed

## Latest verification

- `pnpm exec vitest run tests/unit/drop-down-master.test.ts --reporter=verbose`
  passed: 5 tests.
- `pnpm exec eslint components/admin/drop-down-master-explorer.tsx tests/unit/drop-down-master.test.ts`
  passed.
- `GET /admin/drop-down-master` against the local dev server returned 200 and
  the client component compiled successfully.
- `pnpm typecheck` is blocked by a pre-existing malformed generated file at
  `.next/dev/types/validator.ts`; it did not report a Dropdown source error.

## Known state

The worktree has unrelated untracked agent, build, and log artifacts. Preserve
them and stage only the three files for this Dropdown refinement.

## Rollback

Restore `components/admin/drop-down-master-explorer.tsx` and
`tests/unit/drop-down-master.test.ts` from the prior revision. No migration or
data rollback is required.
