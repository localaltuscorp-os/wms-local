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

## Daily Commitments resilience (2026-10-06)

- The Daily Commitments page could fail at render time when either optional Unfinished-tray query failed. Drizzle displayed only its SQL wrapper in the browser, obscuring the database driver's actionable cause.
- `app/(app)/goals/plan/payload.ts` now catches failures from the earlier-day unfinished and today's pending reads independently, logs the safe root-cause summary on the server through `logDbError`, and renders the planner with an empty Unfinished tray for that request.
- The current plan, access checks, writes, and all database data are unchanged. The next request retries the reads normally.
- If the server log identifies a missing recycle-bin column, review and apply only the relevant canonical additive migrations: `db/migrations/0135_task_recycle_bin.sql` for `tasks.abandoned_at` and `db/migrations/0186_commitment_recycle_bin.sql` for `daily_checklist.abandoned_at`.
- Verification: `git diff --check` passed. Full TypeScript validation remains blocked by the existing generated `.next/dev/types/validator.ts` parser error; no test suite was run.

## WMS workload count styling (2026-10-06)

- The Delegation and Creator Workload tables now render ordinary workload counts and grand-total ratios in neutral slate (`#475569`), including their expanded and transposed views. This matches the adjacent Breakdown control and avoids treating a zero work count as an error.
- Their 600px table viewports now use the existing `no-scrollbar` utility: the native scrollbar rail is hidden while wheel, touch, keyboard, and horizontal/vertical scrolling remain available.
- Actual alert, critical-status, and error indicators retain their existing red styling. No data, query, authorization, or database behavior changed.
- Files: `components/dashboard/exec/workload-cell.tsx`, `components/dashboard/exec/manager-activity-table.tsx`, and `components/dashboard/exec/creator-workload-table.tsx`; the top-bar module/section separator is now a decorative filled triangle in `components/layout/module-section-title.tsx`.
- The decorative triangle is red, reduced to 55% of the surrounding title size, and has a matching smaller horizontal gap, so it remains a clear separator rather than competing with the labels.
- Verification: `git diff --check` passed. The configured typecheck remains blocked by the existing generated `.next/dev/types/validator.ts` parser error.

## Delivery-summary KPI density (2026-10-06)

- The original-due-date summary in `components/dashboard/delivery-spread-section.tsx` now keeps its basis label and all three KPI values on one line. The KPI box uses smaller padding, gaps, and type while retaining the existing values and colors.
- No data, database, access, or API behavior changed. At very narrow widths the fixed single-row presentation should be visually checked before release.
- Verification: `git diff --check` passed. Full TypeScript validation remains blocked by the existing generated `.next/dev/types/validator.ts` parser error.

## Sidebar New Task alignment (2026-10-06)

- `components/tasks/new-task-rail-button.tsx` now left-aligns the New Task plus icon and label using the same inset and icon-to-label gap as the sidebar navigation rows. The visible keyboard-hint badge was removed; the existing keyboard shortcut remains available.
- The oversized outlined action treatment was then removed: the control now uses the shared `nav-pill` row styling so its height, inset, typography, and hover state match the neighbouring navigation entries exactly.
- Its wrapper spacing is now `mt-2`, matching the small visual break below the final navigation row rather than the former oversized action gap.
- No behavior, data, database, or access changes. Verification: `git diff --check` passed.

## Mobile dashboard task-label resilience (2026-10-06)

- `components/dashboard/mobile-today-tasks.tsx` no longer assumes every task label field is a string. The mobile Today card accepts only strings before trimming them, so a malformed historical `description`, `title`, `client`, or `subject` falls through to the existing label fallback rather than crashing the dashboard.
- No task data is modified and no database, authorization, or API behavior changed.

## My Day floating action dock removal (2026-10-07)

- `app/(app)/my-day/page.tsx` no longer opts into the fixed Add Commitment / Start My Day dock. The existing planner controls and day lifecycle remain available in the page itself; only the duplicated floating strip is removed.
- No data, database, authentication, or authorization behavior changed.

## Daily Commitments goals overview (2026-10-07)

- Daily Commitments now renders `components/my-day/daily-commitments-goals-view.tsx` below the planner as a compact, collapsible `This Week's Goals` / `This Month's Goals` card. It has period tabs, the actual count and progress for existing records, and links to the appropriate Goals workspace; it exposes no mutation controls.
- `components/goals/plan/plan-board.tsx` puts the WMS To-Do source rail on the left and the Daily Commitments plan on the right only when `wmsTasksOnly` is enabled. Goals-canvas users keep the original planner-left, source-right layout. The rail collapse control changes edge, chevron, and drag direction to match its new WMS position.
- The WMS To-Do tab now uses a due-task view: All, Overdue, and the current Monday-Sunday dates select the records shown; its contents render as Subject and Task columns. The task cell reuses the existing draggable source card, including the add-to-day and abandon behavior. `SourceItem` now carries the existing task client and subject fields solely to populate that read model.
- `scripts/dummy-db-seed.ts` now supplies local-only open tasks for every day in the current Monday-Sunday week and one overdue task for the dummy administrator. They use invented `Demo` clients and are inserted only by the development PGlite dummy setup; this does not change any configured database.
- Daily Commitments now passes `dragOnly` to its day columns. In that mode `PlanItemCard` hides the doer/initiator status controls, Done/Tomorrow/Day After/Pending/Duplicate actions, pencil, remove button, time inputs, and edit dialog. The drag grip remains active, so a commitment is moved only by dropping it onto another visible day. Other `PlanItemCard` consumers retain their existing controls.
- In Daily Commitments, the day-count selector (`1 day` through `7 days`) is hidden and the one remaining card action is ×. It calls the existing pending action, which stamps the row as unfinished and surfaces it in the Unfinished tray; it does not delete the WMS task or the plan record.
- The Daily Commitments × now opens a modal rather than moving immediately. Users choose `Move to Unfinished` or `Remove from this day`. The second option follows the existing removal semantics: WMS tasks return to Tasks, goal-related rows return to Pull Work, and only standalone daily commitments are deleted.
- `app/(app)/my-day/page.tsx` reads the existing weekly-planner and monthly-period records independently with best-effort fallbacks. It deliberately keeps `getPlanDayPayload(..., { includeGoals: false })`: goals remain outside the WMS plan, cannot be added, reordered, edited, or deleted from this page, and are never materialised into `daily_checklist` merely for viewing.
- Verification: `node node_modules/eslint/bin/eslint.js 'app/(app)/my-day/page.tsx' components/my-day/daily-commitments-goals-view.tsx` passed; `git diff --check` passed.

## Top-bar search control alignment (2026-10-06)

- `components/layout/app-top-bar.tsx` now gives the global-search trigger the same 36px bordered surface and 17px icon sizing as the adjacent upload toolbar control.
- No search behavior, data, or access behavior changed.

## Local-session transient connection retry (2026-10-06)

- `lib/db/with-timeout.ts` now recognizes narrowly scoped code-less transport failures (`network error`, `fetch failed`, and known connection-closed messages) as dropped connections. The local-session lookup retries once on a fresh pooler connection in these cases.
- SQL and schema failures remain non-retryable and surface immediately; this does not change authentication, authorization, data, or migrations.
- Verification: `git diff --check` passed. Full TypeScript validation remains blocked by the existing generated `.next/dev/types/validator.ts` parser error.

## Daily Commitments profile-search placement (2026-10-07)

- The Daily Commitments local search now portals to a dedicated empty host beneath the top-right profile avatar in `components/layout/aura-top-bar.tsx`. The host remains empty on every other screen, so the shared top-bar layout is unchanged elsewhere.
- `components/goals/plan/plan-board.tsx` selects that host only for the WMS To-Do/Daily Commitments planner and removes the temporary placement beneath the employee picker. Search still filters the same local plan and source-rail records.
- The same Daily Commitments-only branch now hides the header `+ Add` shortcut and the `Oldest → Newest` view-sort selector. The in-column composer, task drag-and-drop, and stored drag order remain available; Goals planners retain both controls.
- The complete day-navigation row now portals into the Daily Commitments ribbon: previous/next controls, all visible day tabs, the Today shortcut, and Pull Work remain together. The original blank in-page toolbar is suppressed for this mode; other planner screens retain their existing layout.
- Daily Commitments now uses the ribbon-size variants for that row (smaller arrows, day tabs, Today, and Pull Work) to prevent the controls from colliding with the global header at ordinary widths. Pull Work remains visible in this compact mode.
- The panel-close icon beside the WMS To-Do/Unfinished tabs remains available. The separate floating restore icon below the profile/search controls is hidden in Daily Commitments; the labeled `Pull Work` ribbon control remains available to reopen the panel.
- The Today composer `+` now portals directly below the notification bell; the Daily Commitments local search remains below the profile avatar. The `+` retains its existing expand/collapse behavior and falls back to its in-column location before the client-only header host mounts.
- `Start My Day` is restored in the Daily Commitments ribbon beside the day controls. The separate header/ribbon `+ Add` shortcut remains hidden; the existing Today composer toggle is unchanged.
- Planner day tabs are already valid drag targets, including Today after navigating back using the left arrow. The visible Unfinished panel is now also a drop target: dropping a planned Daily Commitment there calls the existing pending action, preserves the record, and surfaces it in Unfinished rather than deleting it.
- While a commitment is being dragged, hovering either day-navigation arrow now pages exactly one day in that direction and highlights the arrow. This reveals the requested destination column (for example, Tomorrow → left arrow → Today) before the user drops the card. It works for all planner drag sources and planned commitments; the normal click navigation is unchanged.
- The WMS To-Do pane always renders its Subject/Task table, including a table-form empty state. Its existing add-to-day `+` control now appears before task content in table rows and continues to offer Today/Tomorrow/Day After choices. The Due Tasks grid matches the visible Overdue plus Monday–Saturday buckets without an extra unused column.
- No data, database, authentication, authorization, or API behavior changed. `git diff --check` passed. Focused ESLint reported no errors and the four pre-existing `refresh` dependency warnings in the shared planner.

## Daily Commitments delegated-view access (2026-10-07)

- The employee selector now sits immediately beside the Daily Commitments `Start My Day` / `Review My Day` action and uses a rectangular field to match the requested task-area styling. The Daily Commitments day container is also rectangular.
- `lib/goals/plan-target.ts` now defaults the planner to the existing database-backed reporting hierarchy. Administrators receive the full active-employee roster, leaders receive their permitted reporting-line roster, and individual contributors receive no selector because they can plan only their own day. No individual identity is encoded in the UI or authorization logic.
- This is enforced when resolving both displayed plans and mutation targets, rather than relying on client-side visibility. The former open-to-all behavior remains available only through an explicit `GOALS_PLAN_ANY_EMPLOYEE=1`/`on`/`true` deployment configuration.
- Database and migrations: none. Verification: `node node_modules/eslint/bin/eslint.js 'lib/goals/plan-target.ts' 'components/goals/plan/plan-board.tsx' 'components/goals/plan/day-column.tsx' 'app/(app)/goals/plan/actions.ts'` completed with no errors and the four existing shared-planner `refresh` dependency warnings; `git diff --check` passed (with repository-wide CRLF notices only).

## Daily Commitments due-date render correction (2026-10-07)

- `components/goals/plan/plan-board.tsx` now imports the existing `fmtYmd` formatter used by the WMS due-task table's date column. This fixes the client-side `ReferenceError` that occurred whenever a task row with a due date rendered.
- Database, migration, authentication, authorization, and API impact: none. Focused ESLint completed without errors; the four existing shared-planner hook dependency warnings remain.

## Daily Commitments due-task filter removal (2026-10-07)

- Removed the Monday-Saturday date-bucket row from the WMS To-Do panel. The `Your Due Tasks` table now directly shows all due tasks, with its existing due-date, subject, task, and add-to-day controls unchanged.
- Database, migration, authentication, authorization, and API impact: none. Focused ESLint completed without errors; the four existing shared-planner hook dependency warnings remain.

## Daily Commitments resizable WMS panel (2026-10-07)

- Replaced the fixed-width Daily Commitments WMS To-Do rail with a desktop drag splitter. Dragging its right-edge handle right expands the WMS panel; once it reaches the available row width, the Daily Commitments planner is hidden. Dragging that same handle back left restores the planner and a readable two-panel split.
- The WMS panel maintains a 280px minimum and the planner maintains a 260px minimum until full-width mode is reached. The existing click-to-collapse behavior remains on the splitter control. Smaller screens retain the prior stacked layout and do not expose the desktop splitter.
- Database, migration, authentication, authorization, and API impact: none. Focused ESLint completed without errors; the four existing shared-planner hook dependency warnings remain. `git diff --check` passed (repository-wide CRLF notices only).

## Daily Commitments symmetric split view (2026-10-07)

- The desktop splitter now supports full-width mode for either side: moving it left gives Daily Commitments the row and hides WMS To-Do; moving it right gives WMS To-Do the row and hides Daily Commitments. A handle remains on the visible panel edge so the hidden panel can always be restored by dragging in the opposite direction.
- Database, migration, authentication, authorization, and API impact: none. Focused ESLint completed without errors; the four existing shared-planner hook dependency warnings remain. `git diff --check` passed (repository-wide CRLF notices only).

## Daily Commitments default split sizing (2026-10-07)

- Daily Commitments now opens in the requested stable two-panel position: WMS To-Do is approximately 45% of the desktop row on the left and Daily Commitments is approximately 55% on the right. No width is persisted or automatically changed; the panel width becomes pixel-specific only after a user manually drags the splitter.
- Database, migration, authentication, authorization, and API impact: none. Focused ESLint completed without errors; the four existing shared-planner hook dependency warnings remain. `git diff --check` passed (repository-wide CRLF notices only).

## Daily Commitments, project-plan and resilience follow-up (2026-10-08)

- Daily Commitments now keeps the user's selected upcoming-day planning state after they choose Plan Upcoming Days, including after navigating away and returning. The day-closed review screen no longer reappears after that choice. Planner lifecycle controls, the check-in/check-out flow, and existing access checks remain in their established paths.
- The Daily Commitments toolbar and WMS To-Do interactions were aligned with the requested layout: the planner composer can be toggled for future days, adding a written commitment leaves the composer open, the red add control only creates that item, and the source-task add control retains its destination choices.
- Project Plan now labels the sidebar entry as Hierarchy View. The hierarchy and project registers use the requested ribbon styling. Project-register create controls (Project, Milestone, Result, Action, Sub-Action, and Bulk Upload) are rendered in the top ribbon while retaining their existing create dialogs, shortcuts, and authorization path.
- The project hierarchy native horizontal scrollbar is visually hidden while preserving scrolling. The Projects register title/helper copy is hidden only on the Projects level; other register levels retain their context.
- Database resilience handling was improved for optional permission and local-session reads: safe fallbacks preserve existing authorization boundaries when an optional grants/ownership table is unavailable, and actionable server diagnostics are retained. No permission is granted by the fallback.
- Added `db/migrations/0269_attendance_integrity_fields.sql`, an additive/idempotent migration for optional attendance integrity metadata (`integrity_verdict`, `mock_location`, and `anomaly_flags`). Do not apply it without the standard approved database migration workflow.

### Verification and known limitations

- `git diff --check` completed with no whitespace errors; Git reported existing CRLF working-tree notices.
- The local Next production compilation completed successfully. The final Next TypeScript worker stopped with Windows `spawn EPERM`, before application type diagnostics could finish.
- A direct TypeScript run was blocked by malformed generated `.next/dev/types` files while the development server is active. Those files are generated cache output and are deliberately not edited or committed. Re-run validation in a clean, non-concurrent environment.
- The configured `pnpm build` could not start because Corepack rejected the pinned pnpm signature after registry retrieval failed. The local installed Next executable was used to validate compilation without changing package-manager security settings.
- Generated `.next-dev-cache-backup/` and `.pnpm-store/` remain local-only and must stay out of commits.

### Rollback and deployment

- Revert the application commit to undo UI and resilience changes. The attendance migration is additive; if it is applied, do not drop live columns as a casual rollback. Use the normal migration rollback decision process.
