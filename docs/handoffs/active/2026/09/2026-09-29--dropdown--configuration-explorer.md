# Dropdown configuration explorer

- Date: 2026-09-29
- Work item: Dropdown configuration explorer
- Status: Complete locally; not committed or pushed

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

## Known state

The worktree contains unrelated in-progress Temporary Access and Employee
Master changes. Preserve them when staging or committing this work.

## Rollback

Restore the six files listed above from the prior revision. No migration or
data rollback is required.
