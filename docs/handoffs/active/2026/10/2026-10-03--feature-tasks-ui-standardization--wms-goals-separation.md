# WMS Goals separation

- Date: 2026-10-03
- Work item: `feature/tasks-ui-standardization`
- Status: implementation in progress locally; not committed or pushed

## Objective

Keep Goals-derived work out of WMS views while retaining WMS tasks and standalone commitments. Standardize the WMS Initiator Status wording away from "No Verdict".

## Changes

- The WMS sidebar keeps `/my-day` as **Daily Commitments** and no longer lists the Goals review alias.
- Daily Commitments filters Goal-derived planned rows and Goal-origin unfinished rows from its UI.
- Its pull-work rail no longer shows the Goals tab or Goal source cards.
- The empty Initiator Status label on this WMS surface reads **Not Applicable**. The database value remains `NULL`; approval data and authorization were not changed.
- Shared planner surfaces retain their existing Goals behavior and terminology unless they opt into the WMS-only options.
- WMS Tasks no longer fetches or renders the weekly-goal banner.
- The WMS Dashboard no longer fetches or renders its weekly-goal banner.
- The WMS doer Kanban no longer fetches or renders weekly-goal cards.
- WMS task labels use **Pending** in place of **No Verdict**. The task-detail selector exposes Pending, Approved, Not Approved, On Hold, Archived, and Cancelled; self-raised work displays **Not Applicable**.
- After updating this branch from `origin/main`, the locally preserved navigation file was aligned with main's DCC retirement: it no longer imports the deleted `lib/dcc/nav` module and instead links to the Employees Dashboard and Compliance Checklist routes.
- The Tasks Initiator Kanban now has a distinct **Cancelled** column immediately after **On Hold** and before **Archived**. Cancelled is again a current Initiator Status for Tasks: authorized initiators and admins can select it from a card or drop a card into that column. It writes the existing `approval_status = 'cancelled'` value and does not change the task's Doer Status.
- The WMS filter bar now orders Date Range, Employee, Doer Status, Due Date, Subject, Client, Priority, Team, and Initiator Status. Functions is removed; Due Date filters existing overdue and aging-range query rules. When a filter matches no work, the existing task-list empty state is shown.
- The WMS task selection toolbar now includes **View Details** immediately before Archive. It is enabled for exactly one selected task and opens that record through the existing `?task=` task-detail route; it does not alter authorization. Project-plan selections explicitly suppress this task-only action.
- The Due Date → Overdue query now uses only current pending statuses. It no longer submits retired task-status enum values, which caused the Tasks database query to fail in environments where those historical enum values are absent.
- The Due Date query bounds now bind ISO timestamp strings with an explicit `timestamptz` cast. The previous raw-expression bounds supplied JavaScript `Date` objects, which this postgres.js configuration rejects with `ERR_INVALID_ARG_TYPE` before the Overdue query reaches PostgreSQL.
- WMS Tasks now retries its list query using the original Tasks-table shape when the enriched query fails. This prevents older databases—missing optional revised-target, approval, read-receipt, completion, or timer fields—from taking down the Tasks page; unavailable metadata is returned as empty until migrations are applied.

- Shared horizontal overflow containers now hide their native horizontal scrollbar rail across module toolbars, tables, and Kanban boards. Horizontal panning, mouse-wheel scrolling, touch scrolling, and keyboard scrolling remain available; vertical scrollbars are unchanged.
- The Tasks section search now matches every displayed task-table data column: task number, task text, subject, client, doer, initiator, doer status, priority, initiator status, created date, due date, and age. Dates match the displayed `DD-MMM-YYYY` format and the search continues to filter only rows already within the user's authorized scope.
- The Tasks Action column now appears before Client. Existing saved table layouts are migrated once without losing other column-order preferences. Its Start/Stop control is icon-only, with an accessible label and hover tooltip retained.
- When the Tasks employee filter resolves to Only Me, the redundant Doer column is temporarily hidden. The Columns menu can explicitly reveal it, and changing the employee scope restores the person's saved column preference. All task-table body cells are left-aligned.
- Daily Commitments now uses a Tasks-style ribbon below the navbar. Its search icon and its existing Today/Tomorrow/date navigator are rendered in that ribbon through the shared planner state, so both continue to filter or change the actual planner rather than being static controls.
- The ribbon host uses a compact variant of that navigator: smaller day tabs, arrows, selectors, and action buttons prevent the row from overlapping while leaving the full-size controls unchanged on other planner surfaces.

## Files

- `app/(app)/my-day/page.tsx`
- `components/layout/main-nav.tsx`
- `components/layout/filter-bar.tsx`
- `lib/queries/tasks.ts`
- `components/goals/plan/plan-board.tsx`
- `components/goals/plan/day-column.tsx`
- `components/goals/plan/plan-item-card.tsx`
- `components/goals/plan/item-detail.tsx`
- `components/status/status-select.tsx`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/tasks/page.tsx`
- `app/(app)/tasks/kanban/page.tsx`
- `components/tasks/task-list-page.tsx`
- `components/tasks/kanban-board.tsx`
- `components/tasks/initiator-kanban-board.tsx`
- `components/layout/main-nav.tsx`
- `lib/status/axes.ts`
- `db/enums.ts`
- `tests/unit/status-axes.test.ts`
- `tests/unit/status-axes-vocabulary.test.ts`
- `tests/unit/status-axes-cross-module.test.ts`
- `components/tasks/detail/task-detail-redesign.tsx`
- `components/tasks/task-edit-form.tsx`
- `components/tasks/task-status-kpi-strip.tsx`
- `components/tasks/bulk-action-bar.tsx`
- `components/tasks/task-inbox.tsx`
- `components/tasks/task-timer-cell.tsx`
- `components/project-plan/plan-board.tsx`
- `components/project-plan/plan-register.tsx`
- `app/globals.css`

## Database and access impact

No migration. The existing `approval_status` enum already contains `cancelled`. Tasks now treats that value as a current Initiator Status rather than folding it into Archived. The existing initiator/admin authorization rule is unchanged; the authorized users can now apply Cancelled through the Kanban's existing write path. Existing Goal records and checklist rows are not deleted.

## Verification

- Local ESLint was run directly because pnpm's signed-release verification could not complete in this environment. It completed with exit code 0 and 12 pre-existing warnings in shared plan/navigation/Kanban components; no ESLint errors.
- `git diff --check` completed without diff errors. Git reported line-ending warnings in the already-dirty worktree.
- `pnpm exec eslint 'app/(app)/my-day/page.tsx' components/status/status-select.tsx components/goals/plan/plan-board.tsx components/goals/plan/day-column.tsx components/goals/plan/plan-item-card.tsx components/goals/plan/item-detail.tsx components/layout/main-nav.tsx` — passed.
- `git diff --check` on the changed files — passed.
- `pnpm typecheck` was started twice, but the execution environment returned before a completion result; rerun before committing.
- Direct TypeScript checking completed with two unrelated existing errors: `components/goals/board/goal-status-kanban.tsx` is missing `childGoals`, and `components/layout/wms-section-shell.tsx` is missing `ElementType`. Neither file was changed for this work.
- Focused local ESLint for the Due Date filter and bulk-toolbar files completed with no errors. It reported three pre-existing React-hook warnings in `components/layout/filter-bar.tsx` and `components/tasks/task-inbox.tsx`.
- `git diff --check` for the focused files completed without diff errors.
- Focused local ESLint for `lib/queries/tasks.ts` and `components/layout/filter-bar.tsx` completed with no errors; the filter bar retained two pre-existing React-hook warnings.
- Focused ESLint for the Daily Commitments ribbon files completed with no errors and four existing missing-`refresh` dependency warnings in the shared planner. Direct TypeScript checking found unrelated existing errors in `components/goals/board/goal-status-kanban.tsx`, `components/layout/wms-section-shell.tsx`, and the already-dirty `components/tasks/task-table.tsx`; neither ribbon file was reported.
- `git diff --check` for the Cancelled Initiator Kanban files passed. Two focused Vitest commands were started for the shared status-axis tests, but the execution environment ended their output window before returning a result; rerun `pnpm test -- tests/unit/status-axes.test.ts tests/unit/status-axes-vocabulary.test.ts tests/unit/status-axes-cross-module.test.ts` before committing.
- The deleted-module import was removed from `components/layout/main-nav.tsx`; `git diff --check` passed for that file. A focused `pnpm exec eslint components/layout/main-nav.tsx` run did not return a completion result in this environment.

## Rollback

Revert the focused changes above. If Cancelled statuses have been assigned after release, they will remain stored unless intentionally changed to another Initiator Status; no schema rollback is required.

## Main integration

- Integrated `origin/main` through `5a4b55b4` in merge commit `7895ec95`.
- The only conflict was `components/layout/module-footer.tsx`. The task branch deliberately retains its rectangular, full-width footer treatment; all other incoming main changes were preserved.
- Generated `.next-dev-cache-backup/` and `.pnpm-store/` remain local-only and are excluded from commits.

## CI follow-up

- PR #11's required `test` check failed at TypeScript validation. The follow-up corrects the flat Goal Kanban card wiring by passing its required stable empty `childGoals` list, defaults an unspecified Tasks Doer-column visibility to visible, and narrows persisted column-order ids before checking the fixed workflow-order tuple.
- A local `pnpm typecheck` was started for the follow-up but did not return a completion result within the execution window. Rely on the replacement PR check before merge.

## Billing schema-drift repair (2026-10-05)

- The New Billing Document page failed while reading billable products because the configured database lacked `outstanding_products.display_name`, though the current Drizzle schema and query both require that optional field.
- Added `db/migrations/0268_ensure_outstanding_product_display_name.sql`. It contains only `ALTER TABLE ... ADD COLUMN IF NOT EXISTS display_name text`; it neither changes nor deletes existing rows. The historical `0259_masters_billing_part2.sql` was deliberately not replayed because it also performs unrelated product and subject cleanup.
- Applied and verified the same additive column repair against the configured database. The exact previously failing billable-products query then succeeded.
- Database impact: adds a nullable `display_name` column only. Rollback, if ever required, should be planned separately; do not drop a live column merely to undo this change.
- Verification: `git diff --check` passed; the exact `outstanding_products` billing-product read returned successfully after the column was added.
