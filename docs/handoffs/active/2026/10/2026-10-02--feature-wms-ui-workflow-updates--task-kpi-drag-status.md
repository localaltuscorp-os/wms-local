# Task KPI drag-to-status

- Date: 2026-10-02
- Work item: `feature-wms-ui-workflow-updates`
- Objective: Allow task status changes by dropping Tasks-list rows or Kanban cards on doer KPI cards.
- Status: Implemented; local verification complete.

## Summary

- Tasks-list rows can be dragged onto writable doer KPI cards. The target maps to the canonical status: Not Read → `dont_know`, Not Started → `not_started`, Initiated → `initiated`, Follow Up → `follow_up`, Need Info → `need_info`, Done → `done`, and Abandoned → `abandoned`.
- Kanban now shows the same doer KPI drop targets above its board as a compact colored KPI-pill strip (Total plus each writable status). Dropping a card updates its status using the existing Kanban optimistic movement and then places it in the target column.
- Selecting the Kanban Initiator Status axis replaces that strip with the matching Tasks-style sequence: Total, Done, Abandoned, Pending, Approved, Not Approved, On Hold, Cancelled, and Archived. Writable verdict cards also accept authorized initiator-status drops.
- In that strip, Done and Abandoned are read-only doer-progress counts; Pending is the no-verdict count and Cancelled reads existing cancelled approval records.
- The Tasks-section Initiator KPI strip mirrors Done, Abandoned, and Pending alongside its existing verdict cards; its existing filter links remain intact.
- The active Kanban KPI strip is portaled to the page-level outlet below the filters, outside the rounded Kanban board panel, while retaining its board drag context.
- Kanban now treats the Filter Bar's `view` value as its primary Doer/Initiator axis (with legacy `axis` links as fallback), so the Filter Bar, board, and KPI strip switch together.
- Doer KPI palette: Total and Done retain their existing colors; Not Read is violet so each remaining Doer KPI has a distinct status color across Tasks, Kanban, and the shared KPI strip.
- Initiator KPI palette: Total and Done retain their existing colors; Pending is violet, Approved teal, Not Approved red, On Hold amber, Cancelled orange, and Archived fuchsia so no cards share a color.
- Shared top-bar titles now render module first and active section beside it (for example, `WMS · Tasks`) for both route-derived and page-provided titles.
- The shared module footer is now a rectangular, full-width navigation bar. It starts directly beside the module sidebar, is flush with the bottom of the viewport, and uses the same light gradient as the top navigation instead of floating as a rounded dock.
- The outer table-control bars use square corners in the shared WMS, Billing, Accounts, Client Engagement, and HR toolbar implementations. Individual action buttons and content cards keep their existing shapes.
- The Tasks `All (count)` selection action now matches the neutral quick-action color and becomes white on hover. Corporate logo images have been removed from the shared desktop/mobile module rails and the separate HR module rail; each module's icon/name is now the Hub link.
- The task Start action now uses the same soft-gray control treatment as the global + action (Stop remains red). The `All (count)` action and active Doer/Initiator view controls use that same soft-gray treatment in both the filter bar and Kanban switcher.
- Total and initiator-verdict cards remain non-writable filter controls.
- The Tasks Initiator KPI strip no longer shows the `PENDING / NO VERDICT` card; this is presentation-only and does not alter pending-task data or approval behavior.
- Projects, Documents, Review & Scores, and Index Hub now share the Tasks section's WMS content-column geometry: bounded wide layout, responsive gutters, compact top spacing, and consistent bottom clearance. Their existing workspaces, loaders, filters, controls, and permissions are passed through unchanged.
- Review & Scores now uses the Tasks-style square control bar and standard table content rectangle. Its sortable, draggable column headers were already implemented through the shared `InteractiveTableHeaderCell`; that interaction is retained without changing review data, scoring, or permissions.
- Yearly Goals now uses Tasks-style square filter/control bars and no longer repeats the "Yearly Goals" body heading. It has a Yearly-only Doer/Initiator KPI perspective switch: the cards read existing `goal.status` and `approverStatus`/`approvalStatus` values and update the board's existing client filter sets only. Its FY and person dropdowns, table rectangle, sticky headers, column reorder, pagination, fullscreen behavior, data, and writes remain unchanged.
- The shared top bar now displays the same `View  Doer  Initiator` presentation control on Goals and Project-plan routes. It is intentionally navigation chrome only: it does not alter either module's data, filters, permissions, or writes.
- Project Plan now has the Tasks-style status KPI row in both its hierarchy board and default register. It counts existing Doer and Initiator status values, and clicking a card applies the view's existing local status filter; no status vocabulary, server action, permission, or write path changed. Yearly Goals retains its equivalent KPI row.
- The duplicate Doer/Initiator switch immediately before the Yearly Goals KPI row was removed, so that row begins directly with Total as requested.
- Labeled module-page Full screen controls were removed from Goals (yearly, weekly, and approval), Project Plan, Accounts shared checklist toolbars, Salary, and Billing Customer Master dropdowns. Drawer/media fullscreen controls remain out of scope.
- Yearly Goals now follows the requested Tasks-like vertical sequence: its existing Area, Type, Doer Status, and Initiator Status dropdowns appear directly below the navigation; the KPI row follows; the existing command/table-control row follows with the collapsed local-search icon aligned at the right. The Yearly dropdowns are removed from their previous lower toolbar position so they are not duplicated. No date range was added.
- The Yearly Goals local-search control now lives in the far-right side of that top filter strip, matching the Tasks filter-bar placement; it is no longer duplicated in the lower Yearly command row.
- Yearly Goals now also promotes any active Area, Type, Doer Status, or Initiator Status dropdown to the front of that strip, matching the Tasks filter-bar behavior. It retains no date-range filter.
- The Yearly Goals List / Kanban / Dashboard selector now sits on the New Goal / FY / Viewing command line and remains available after switching views; the duplicate selector is hidden from the lower Yearly toolbar. Other Goals levels keep their existing lower-toolbar selector.
- Yearly Goals now keeps compact Sort, Rows, and Columns controls on that same command line immediately before Export. Its redundant lower feature-toolbar row is hidden, while other Goals levels retain it.
- The Yearly Goals command bar is now a compact no-wrap row: List/Kanban/Dashboard stays left and the remaining controls stay right. A narrow viewport scrolls that one row horizontally rather than wrapping controls onto a second line.
- Yearly-only trigger sizing was reduced further for New Goal, the FY stepper, Viewing, Export, and Bulk Upload. `ViewingSelect` and `GoalsBulkUpload` accept an opt-in compact mode, so other Goals screens retain their original dimensions.
- The Yearly Areas / Types / Doer Status / Initiator Status second-navigation strip now remains visible in both List and Kanban. Both views use the same goal filter function; Dashboard keeps its own analytics filters.
- The Yearly Goals filter strip is a border-only second navigation row immediately below the application header. It stays inside the Goals workspace column so it aligns with the content area and never overlaps the persistent left rail. The controls retain their existing client-side filter behavior; the change is visual placement only.
- A shared, initially-empty second-ribbon portal slot now lives below the global top bar. Yearly Goals portals its existing Areas, Types, Doer Status, Initiator Status, and local search controls into this slot. The slot takes no space on routes that do not use it; Project Plan, Accounts, Billing, and HR migration is still pending.
- The shared Goals/Project Plan top-bar Doer/Initiator selector now emits a local UI event. Yearly Goals listens to it so its KPI strip swaps between the existing Tasks-equivalent Doer and Initiator card sets; card clicks retain their existing local filtering behavior and do not write data.
- In the Yearly Goals Kanban, the Doer KPI cards are now rendered through the Kanban drag context and act as status drop targets. Dropping an owned Goal on Not Started, Initiated, Done, or another Doer-status card updates `goals.status` through the existing authorized `editGoal` action, with optimistic UI reconciliation and a confirmation toast. The goal percentage is intentionally unchanged because Goal status is a separate persisted field. Initiator cards and Total remain filter-only.
- The Yearly Goals List now also supports this flow: drag a row from a non-editable cell onto a Doer KPI card. The row id is carried only in the in-browser drag payload, then resolved against the board's loaded Goal data before the existing authorized update runs. Inputs and buttons keep their normal inline-edit behavior and do not start a row drag.
- The Goals KPI display value `not_read` is correctly translated to the canonical stored status `dont_know` for status writes and filtering, so dropping onto Not Read remains valid under the shared Task/Goals status enum.
- Goals Kanban has been replaced on the shared Yearly/Quarterly/Monthly level board with a flat Tasks-style Doer-status Kanban: Not Read, Not Started, Initiated, Follow Up, Need Info, Done, and Abandoned. It scopes cards to the selected period and level, and a card drop persists only the existing `goals.status` field. The former hierarchy/cascade lanes are no longer rendered when Kanban is selected; List view retains the existing period/cascade workflow.
- Yearly Kanban now portals its Doer/Initiator KPI strip into its existing header host from within the same DnD context, matching Tasks: Doer KPI cards are clickable filters and live drop targets for Kanban goal cards. Each has a unique DnD id (separate from its matching column) so collision detection remains deterministic. The existing Yearly filter ribbon already stably sorts active controls before inactive controls, matching the requested active-filter-first Tasks behavior.
- Yearly Goals now also exposes each selected Area, Type, Doer Status, and Initiator Status as an individually removable active-filter chip at the front of its ribbon, with a Clear all action. The existing multi-select dropdowns remain in place after those chips. This deliberately retains the module's single viewed-person board scope; it does not combine goals from multiple employees.
- Monthly and Quarterly Goals now use the same Tasks-style status workspace as Yearly Goals: the ribbon contains the active-filter chips and the Area/Type/Doer/Initiator controls; Doer/Initiator KPI cards follow the shared top-bar perspective; and the flat status Kanban/list drag flow reuses the same authorized goal-status write. Their period/FY navigation, current person scope, and existing permission model are unchanged.
- The redundant in-body Monthly and Quarterly Goals headings were removed; each page keeps its existing application-chrome title.
- The single-line Goals command bar remains horizontally scrollable on narrow screens, but now uses the shared `no-scrollbar` treatment so its native scrollbar is hidden like the footer navigation.
- The Yearly/Quarterly/Monthly Goals ribbon controls and selected-filter chips now use the shared Tasks `filter-pill` geometry (compact padding, 11px rounded rectangle, border, and active tint). The ribbon itself is one no-scrollbar horizontal line, matching the Tasks filter bar rather than wrapping controls.
- Weekly Goals keeps its existing Week-to-Day Kanban (a day-date planning workflow), per the requested exclusion. Its List view now uses the shared top ribbon for Area, Type, Doer Status, and Initiator Status filters; those controls use the same Tasks `filter-pill` geometry and active-first ordering. The duplicate in-body Weekly Goals title is hidden, and the remaining Weekly command toolbar hides its horizontal scrollbar.
- Weekly List now replaces its former Total/Done/On Track/Behind progress chips with the Tasks-style Doer KPI sequence: Total, Not Read, Not Started, Initiated, Follow Up, Need Info, Done, and Abandoned. Counts cover adopted weekly goals; the persisted `dont_know` value is translated to Not Read. Clicking a KPI applies the existing local Doer Status filter. Weekly Kanban remains unchanged.
- Weekly's List/Kanban/Dashboard selector, Sort, Rows, and Columns controls now lead the command row before the week/date selector, matching the requested Tasks toolbar order. The date picker continues to scope the selected weekly period.
- Follow-up placement refinement: the Weekly view selector stays before the date picker, while List-only Sort, Rows, and Columns now sit immediately beside Weekly Bulk Upload.
- The Weekly ritual-toolbar container is hidden when the selected week has no adopted goals, removing its otherwise blank bordered strip. It still renders for weeks with Commit/Approve/Review actions.
- Weekly List now mirrors Monthly's ribbon presentation: each selected Area, Type, Doer Status, or Initiator Status is surfaced as a removable active-filter chip with a Clear all control. Its command strip uses the same rectangular shape. Both pages already use the shared `GoalTableView`, so the table shape was already consistent. Weekly Kanban is unchanged.
- Weekly Commit, Approved, and Review controls now appear in the primary command row immediately before Weekly Bulk Upload; the former secondary ritual strip is hidden. This is presentation-only and does not alter commit, approval, review, or Kanban behavior.
- Weekly List rows now support native drag-and-drop onto the Doer KPI cards (Not Read through Abandoned). A visible grip beside the selection checkbox is the reliable drag origin; the drop maps the displayed Not Read key to the persisted `dont_know` status and calls the existing authorized `updateWeeklyCascadeFields` action. It leaves percent-complete and the separate Week-to-Day Kanban workflow unchanged.
- Weekly Goals now subscribes to the shared top-bar Doer/Initiator perspective event, matching Yearly Goals. The Doer view shows Doer KPIs and permits the existing status drag; the Initiator view shows the Yearly-equivalent Total, Done, Abandoned, Pending, Approved, Not Approved, On Hold, Cancelled, and Archived KPI cards. The switch is display/filter state only; Weekly Kanban remains unchanged.
- Weekly List now includes the shared collapsed search icon in its filter ribbon. It expands to a local title, area, and notes search, matching the Yearly Goals search behavior; Kanban and Dashboard data are unchanged.
- Team Productivity (`/productivity/team`) now uses the Yearly Goals-style filter ribbon for its existing employee-performance controls: selected Function/Team/Status/Grade filters appear as removable chips with Clear all; filters, sort, and collapsed search live in the shared top ribbon. Existing employee metrics, archive permission/action, grade logic, and drill-down behavior remain unchanged. The Productivity table container now uses the matching square-corner treatment.
- Review & Scores now uses the shared collapsed search icon beside its KPI strip. It opens the pre-existing local Review search field in that same row and retains the existing title/code/area/category/period/notes matching and paging-reset behavior.

## Files changed

- `components/tasks/task-list-page.tsx`: KPI native drop handling and status mutation feedback.
- `components/tasks/task-kpi-drop-link.tsx`: client-only KPI drop behavior; keeps the page component server-renderable.
- `components/tasks/task-table.tsx`: native task-row drag payload.
- `components/tasks/kanban-board.tsx`: DnD-kit KPI drop zones integrated with existing board movement.
- `components/tasks/initiator-kanban-board.tsx`: Tasks-style initiator KPI strip, exact card ordering, color palette, and verdict drop zones.
- `app/(app)/tasks/kanban/page.tsx`: page-level Kanban KPI outlet outside the board panel.
- `components/tasks/kanban-axis-toggle.tsx`: aligns the board axis with the Filter Bar's `view` parameter.
- `components/layout/module-section-title.tsx`, `components/layout/aura-top-bar.tsx`, `components/layout/page-title.tsx`: global module-first section title rendering.
- `components/layout/module-footer.tsx`, `components/layout/chrome-shell.tsx`: rectangular, sidebar-adjacent shared footer navigation with the top-bar gradient and no trailing bottom gap.
- `components/tasks/task-table.tsx`, `components/billing/table-toolbar.tsx`, `components/accounts/checklist-table-toolbar.tsx`, `components/client-engagement/ui.tsx`, `components/hr/record/letters-table.tsx`: square-cornered outer table toolbars.
- `components/tasks/task-timer-cell.tsx`, `components/tasks/kanban-axis-toggle.tsx`, `components/layout/filter-bar.tsx`: neutral-gray action and Doer/Initiator view styling.
- `components/layout/wms-section-shell.tsx`: WMS-only, presentation-only Tasks-reference page frame.
- `app/(app)/projects/page.tsx`, `app/(app)/documents/page.tsx`, `app/(app)/review/page.tsx`, `components/index-hub/index-hub-board.tsx`: adopt the shared WMS section frame or its equivalent layout classes without changing feature logic.
- `components/goals/review/review-workbench.tsx`, `components/goals/review/review-table.tsx`: Tasks-style review toolbar, search control, table rectangle, border, and shadow treatment; existing column drag/sort remains intact.
- `components/goals/board/goals-level-board.tsx`: Tasks-style square presentation for the existing Goals filter and feature-control bars (including Yearly Goals).
- `components/goals/board/goals-level-board.tsx`, `components/goals/board/hierarchy-kanban.tsx`: Yearly Kanban KPI status-drop wiring through the existing Goal edit action.
- `components/goals/board/goal-table-view.tsx`: opt-in native KPI-status row-drag hook with a visible drag grip beside the selection checkbox; table consumers that do not opt in are unchanged.
- `components/goals/board/goal-status-kanban.tsx`: new flat Tasks-style Goal status board and DnD status columns.
- `components/goals/board/goals-level-board.tsx`, `components/goals/board/goal-status-kanban.tsx`: Tasks-style portalled KPI drop strip for Yearly Goal Kanban.
- `components/goals/board/goals-level-board.tsx`: Tasks-style explicit active-filter chips and comprehensive Yearly filter clearing.
- `components/goals/board/goal-board-card.tsx`: adds the narrowly scoped status-drag mode so status movement does not depend on the structural reorder permission.
- `components/layout/page-chrome-slots.tsx`, `components/layout/chrome-shell.tsx`: shared optional page-filter-ribbon portal location below the top bar.
- `components/layout/aura-top-bar.tsx`: broadcast the module Doer/Initiator perspective to subscribed module pages.
- `components/layout/aura-top-bar.tsx`: Goals and Project-plan-only Doer/Initiator top-bar presentation selector.
- `components/project-plan/plan-status-kpi-strip.tsx`, `components/project-plan/plan-board.tsx`, `components/project-plan/plan-register.tsx`: reusable Tasks-style Project Plan status KPI strip, counts, and existing client-side filter wiring for board and register views.
- `components/goals/board/goals-level-board.tsx`, `components/goals/weekly/weekly-cascade-board.tsx`, `components/goals/approve/approve-workbench.tsx`, `components/project-plan/plan-board.tsx`, `components/accounts/checklist-table-toolbar.tsx`, `components/salary/salary-breakup-table.tsx`, `components/billing/dropdown-master-view.tsx`: remove labeled module-page Full screen controls only.
- `components/goals/weekly/weekly-cascade-board.tsx`: Tasks-style Weekly List Doer KPI cards and status-filter wiring; no Weekly Kanban behavior change.
- `components/goals/weekly/weekly-cascade-board.tsx`: shared top-bar Doer/Initiator KPI perspective listener and Yearly-aligned Initiator KPI counts/filtering.
- `components/goals/team/team-performance-board.tsx`: Productivity-only Yearly-style shared filter ribbon, active-filter chips, and square table presentation; Goals Team Dashboard retains its existing inline toolbar and rounded table.
- `components/goals/review/review-workbench.tsx`: replaces the custom Review search trigger with the shared collapsible-search component in the KPI row.
- `components/goals/weekly/weekly-dashboard.tsx`: adds the shared collapsible local-search control to the Dashboard filter row; it filters weekly goals by title, area, type, and notes without changing server data or permissions.
- `lib/tasks/kpi-drop.ts`: shared KPI-to-status mapping.
- `lib/tasks/set-status.ts`: retries transient write failures and returns a controlled action error instead of surfacing an unhandled database stack trace.
- `tests/unit/task-kpi-drop.test.ts`: mapping and non-writable-key coverage.

## Database and security

- No migration or schema change.
- Goal status updates use the existing Goals write authorization and input validation in `editGoal`; no access rule changed.
- Status writes continue through `setTaskStatus` / `applyTaskStatusChange`, preserving authentication, transition authorization, optimistic locking, audit events, notifications, and completion timestamps.

## Testing

- `pnpm typecheck` — passed.
- `pnpm test -- tests/unit/task-kpi-drop.test.ts` — attempted, but did not complete within the local tool window and emitted no result. Re-run in a normal local terminal before committing.

## Risks and rollback

- `node_modules/.bin/tsc.cmd --noEmit` passed for the latest Yearly Goals toolbar update.
- `node_modules/.bin/eslint.cmd components/goals/board/goals-level-board.tsx components/goals/board/hierarchy-kanban.tsx` completed with no errors; it reported five pre-existing `react-hooks/set-state-in-effect` warnings in `goals-level-board.tsx`.
- `node_modules/.bin/eslint.cmd components/goals/board/goals-level-board.tsx components/goals/board/hierarchy-kanban.tsx components/goals/board/goal-table-view.tsx` completed with no errors; it reported the existing five board warnings and ten existing `goal-table-view.tsx` hook/dependency warnings.
- `node_modules/.bin/eslint.cmd components/goals/board/goals-level-board.tsx components/goals/board/goal-board-card.tsx components/goals/board/goal-status-kanban.tsx` completed with no errors; it reported five existing `goals-level-board.tsx` and two existing `goal-board-card.tsx` React-effect warnings.
- `node_modules/.bin/eslint.cmd components/goals/board/goals-level-board.tsx` completed with no errors; it reported the same five existing `react-hooks/set-state-in-effect` warnings in that board.
- `node_modules/.bin/tsc.cmd --noEmit --pretty false` is currently blocked before source checking by an existing generated-file parse error at `.next/dev/types/validator.ts:3676` (`TS1128`).
- `node_modules/.bin/eslint.cmd components/goals/weekly/weekly-cascade-board.tsx` completed with no errors; it reported one existing `react-hooks/set-state-in-effect` warning for the localStorage view-preference effect.
- `node_modules/.bin/eslint.cmd components/goals/weekly/weekly-cascade-board.tsx components/goals/board/goal-table-view.tsx` completed with no errors; it reported eleven existing React hook/dependency warnings (one in Weekly and ten in the shared table).
- `node_modules/.bin/eslint.cmd components/goals/weekly/weekly-cascade-board.tsx` completed with no errors; it reported the existing localStorage view-preference React-effect warning.
- `node_modules/.bin/eslint.cmd components/goals/team/team-performance-board.tsx` completed with no errors or warnings.
- `node_modules/.bin/eslint.cmd components/goals/review/review-workbench.tsx` completed with no errors; it reported five existing React state-in-effect warnings.
- `pnpm eslint components/goals/weekly/weekly-dashboard.tsx components/layout/aura-top-bar.tsx` completed with no errors or warnings. The Aura top bar already renders the universal global-search icon and palette trigger for every module.
- `git diff --check -- components/goals/board/goal-table-view.tsx components/goals/weekly/weekly-cascade-board.tsx` passed; Git printed only repository-wide CRLF conversion notices.
- The latest `pnpm typecheck` could not start because Corepack rejected the locally selected pnpm signature after registry fetch failures; re-run it after registry/signature resolution. `git diff --check` passed, with only existing line-ending warnings.

- A user without a permitted transition receives the existing server rejection and the Kanban card is restored.
- Roll back by reverting the five files listed above; no data migration is involved.

## Git

- No commit or push made.
- Existing untracked cache directories remain untouched.
