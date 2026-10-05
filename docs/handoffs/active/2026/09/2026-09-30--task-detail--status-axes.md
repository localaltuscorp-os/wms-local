# Task Detail Status Axes

- Date: 2026-09-30
- Work item: task-detail
- Status: complete

## Objective

Show the independent Doer Status and Initiator Status controls on the Task Detail page.

## Changes

- Updated `components/tasks/detail/task-detail-redesign.tsx`.
- Replaced the single unlabeled status control with labeled Doer Status and Initiator Status controls.
- Reused the existing `setTaskStatus` and `setTaskInitiatorStatus` server actions.
- The doer control continues to use the existing progress lifecycle; the initiator control uses Approved, Not Approved, On Hold, and Archived.
- The existing server-side authorization and audit events remain authoritative. The UI only exposes the relevant control to permitted users.

## Database and access impact

- Database/migrations: none. The existing `tasks.status`, `tasks.approval_status`, and `tasks.archived` fields are reused.
- Authorization: no policy changes. Doer-status writes retain existing task-action checks; initiator-status writes remain limited to the initiator or an administrator.

## Testing

- `node node_modules/eslint/bin/eslint.js components/tasks/detail/task-detail-redesign.tsx` — passed.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit` — passed after regenerating a corrupt disposable `.next` cache.
- `git diff --check` — passed (the working tree has pre-existing line-ending warnings only).

## Deployment and rollback

- No migration or deployment sequencing is required.
- Roll back by reverting the Task Detail component change.

## Follow-up: Kanban status axes (2026-10-01)

- The Doer Kanban now renders only the seven doer lifecycle lanes: Not Read,
  Not Started, Initiated, Follow Up, Need Info, Done, and Abandoned.
- Approval and archive lanes were removed from the Doer board and remain on the
  Initiator board. The Initiator board's undecided lane is labelled
  `Pending / No Verdict`.
- Legacy rows that still have a verdict stored in `tasks.status` are displayed
  in the Doer fallback lane instead of disappearing; no task data was changed.
- Files: `app/(app)/tasks/kanban/page.tsx`,
  `components/tasks/kanban-board.tsx`, `lib/kanban-columns.ts`, and
  `lib/status/axes.ts`.
- The same axis separation now applies to `components/project-plan/plan-kanban.tsx`
  and the Doer-only mobile Kanban response at `app/api/mobile/tasks/kanban/route.ts`.
- Project Plan Kanban now shares the Tasks board presentation: a contained white
  board surface, coloured lane headers and counts, dashed empty drop zones,
  fixed-width lanes, and coloured card accents. Its drag/drop, authorization,
  and project data flow are unchanged.
- The shared Aura header now displays the current route's section name using the
  established navigation registry. Project Plan portals its existing status-axis
  control into that header only while its Kanban view is active; modules without
  a board-level Doer/Initiator axis receive no status switch.
- Restarted the local Next development server after it served a stale 404 for the
  compiled `/tasks/kanban` route; a local HTTP check now returns 200. The active
  Doer/Initiator pills use the neutral gray header treatment in Tasks and Project
  Plan, while unrelated List/Kanban controls keep their existing colours.
- Verification: `git diff --check` passed (pre-existing line-ending warnings
  only). Focused ESLint was started but did not complete within the command
  window and produced no diagnostics.

## Follow-up: Tasks Kanban hydration warning (2026-10-01)

- Fixed the Tasks Kanban server/client hydration mismatch reported on sortable
  column handles. `@dnd-kit` had been deriving `aria-describedby` from a
  module-level counter, which resulted in different values during SSR and
  browser hydration.
- `components/tasks/kanban-board.tsx` now supplies `DndContext` with a stable
  `React.useId()` value. Drag/drop behavior and accessibility instructions are
  unchanged; only the generated identifier is now deterministic.
- Verification: focused ESLint exited successfully with no diagnostics, and
  `git diff --check -- components/tasks/kanban-board.tsx` passed (only the
  repository's pre-existing line-ending warnings were emitted).

## Follow-up: light status-axis selection (2026-10-01)

- Updated the Tasks Doer/Initiator selector in `components/layout/filter-bar.tsx`
  to use the existing light segmented-control surface instead of a dark gray
  fill. The selected label stays dark and remains accessible.
- Applied the style to both the header portal and in-bar fallback render paths.

## Follow-up: dashboard console warning (2026-10-01)

- Browser log review identified React's warning for `inert=""` on collapsed
  dashboard content. `components/dashboard/section-chrome.tsx` now passes the
  boolean value `inert={true}`, preserving the existing keyboard and
  accessibility behavior without the console warning.
- `git diff --check -- components/dashboard/section-chrome.tsx` passed (only
  the repository's existing line-ending warning was emitted). The focused
  eslint/server health command did not finish within the local command window,
  so it produced no additional result.

## Follow-up: reusable interactive table headers (2026-10-01)

- Added `components/ui/interactive-table-header-cell.tsx`, a shared Tasks-style
  table header adapter. It keeps the drag grip separate from the sort button,
  displays the same sort affordances, reduces opacity while dragging, and marks
  only the active drop edge in red.
- Updated `components/admin/ui/data-table.tsx` to use the adapter for all of
  its existing admin and incentive consumers. Its columns now preserve their
  order in local storage (with reconciliation when a table schema changes).
- No database, authorization, filtering, pagination, export, or business-data
  behavior changed. Bespoke interactive tables still require individual
  migration because their cell rendering and server-data contracts vary.

## Follow-up: Tasks Abandoned sky-blue presentation (2026-10-01)

- Updated the Tasks Abandoned KPI chip and inline Doer-status list/badge to
  render sky blue. The Tasks table receives a legacy admin-configured red token
  at runtime, so the narrow presentation override is applied at the Tasks
  display layer while status values, permissions, and stored configuration stay
  unchanged.

## Follow-up: WMS Dashboard status KPI strip (2026-10-01)

- Added the compact Tasks-style status KPI strip immediately below the WMS
  Dashboard filters. It follows the existing Doer/Initiator selector: Doer
  shows lifecycle states and Initiator shows verdict states.
- `loadDashboardData` now derives `taskStatusCounts` from its existing
  `periodTasks` collection, so the strip uses the exact same date, employee,
  department, priority, and subject scope as the dashboard widgets. No extra
  database query, task mutation, or authorization change was introduced.
- The dashboard cache payload key is now `dashboard-data:v4`, preventing a
  stale v3 cache payload from rendering without the new count field.
- Files: `app/(app)/dashboard/page.tsx`, `lib/queries/dashboard.ts`,
  `lib/types.ts`, `lib/task-status-kpis.ts`, and
  `components/tasks/task-status-kpi-strip.tsx`.
- Verification: `git diff --check` completed with only the repository's
  existing line-ending warnings. Focused ESLint was started but did not finish
  within the local command window and emitted no diagnostics.

## Follow-up: remove legacy dashboard Task Summary cards (2026-10-01)

- Removed the large legacy `Task Summary` card block from the WMS Dashboard at
  the user's request. The compact Tasks-style status KPI strip remains directly
  below the filters; no task data, dashboard filters, or other dashboard
  sections were removed.

## Push handoff: WMS UI workflow updates (2026-10-01)

- Branch: `feature-wms-ui-workflow-updates`.
- Scope includes the accumulated Tasks, Kanban, Dashboard, Review, navigation,
  archive, and Billing UI/workflow changes in the worktree, including shared
  Tasks-style table-header support.
- No migration was added. Existing schema changes must be reviewed with the
  related Billing workflow changes before release.
- Stashes were inspected only and left unchanged: `stash@{0}` through
  `stash@{3}`.
- Validation before commit: `git diff --check` completed with only existing
  line-ending warnings. Full lint/typecheck did not complete in the local
  command window and should be run by CI or before merge.
- Rollback: revert the resulting feature-branch commit; no production release
  or direct `main` push was performed.
