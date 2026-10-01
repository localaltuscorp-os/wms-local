# Employees CC compliance checklist migration

- Date: 2026-10-01
- Work item: employees-cc
- Status: implemented and verified locally; ready for branch synchronization and review

## Objective

Replace the retired DCC/WCC/MCC browser entry points with one Employees →
Compliance Checklist route at `/employees/cc`, while preserving the existing
compliance data and server-side authorization rules.

## Implemented

- Added `/employees/cc` with Daily, Weekly, Monthly, Quarterly, 6-Months,
  Yearly, and Consolidated tabs. Consolidated is split into those six cadence
  sections instead of mixing overdue records together.
- Restored the module landing at `/employees/dashboard`; `/employees` now
  resolves there and the Employees rail exposes Dashboard separately from the
  checklist.
- Daily only accepts today or future dates; the previous-day control is disabled
  on today and past URL values resolve to today.
- Added tracking columns for each timeframe. They render directly after Mins and
  retain a per-user session/browser order.
- Daily navigation now shows both weekday and date as `Thu · 01-Oct-2026`.
  Its Daily tracking-column sublabel uses the same canonical `DD-MMM-YYYY`
  format; URL values and date-locking rules remain `YYYY-MM-DD` internally.
- Added select-all, bulk delete, and bulk duplicate. Duplication copies the task
  setup but deliberately does not copy completion history.
- The add/edit dialog and CC bulk workbook now call the legacy `section` field
  **Subject** and source its picker from active Admin-panel subjects. Existing
  values remain selectable so old records are never obscured.
- Added four-date schedules: `4 times/month`, `Quarterly — multiple due dates`,
  and `Half Yearly — multiple due dates`. The dialog, workbook validation,
  import parser, occurrence engine, and templates use the same schedule rules.
- Fixed the shared sticky-table layering contract so ordinary sticky headers no
  longer paint over frozen left/right columns during horizontal scrolling. The
  Employees CC board now also pins every frozen header and body cell to the
  exact width used for its computed sticky offset, preventing width/offset drift
  and overlap in the timeframe tables.
- Replaced the frozen rail's broad blurred drop shadows with a one-pixel
  hairline grid divider in both the header and body. The CC board now reads as
  one continuous table while keeping the same frozen columns, offsets, widths,
  and stacking order.
- Moved the compliance server actions to `/employees/cc/actions` and repointed
  bulk upload, dashboard drill-downs, reminders, archive restore, workspace
  matching, permission catalogue, and Employees navigation.
- Deleted the complete `app/(app)/dcc` route tree, legacy route templates, the
  old DCC navigation helper/test, and unreferenced legacy DCC UI components.

## Data, migration, and access

- Existing `dcc_kpi_items`, `dcc_entries`, and `dcc_compliance_period_checks`
  remain the compatibility storage for the new UI. Migration
  `0263_mcc_multi_date_schedules.sql` only widens existing check constraints to
  accept the three new frequency codes and two through four ordered due days;
  it rewrites no compliance records and adds no columns.
- The TypeScript period-kind union was widened for the new CC tracking values;
  the database discriminator is already a text field and existing WCC/MCC data
  is not altered.
- Existing current-user checks, scope checks, item-write guards, and approver
  guards are retained. No access boundary was weakened.

## Validation

- Passed: `npm.cmd run test -- tests/unit/cc-timeframes.test.ts tests/unit/compliance-columns.test.ts tests/unit/compliance-bulk-actions.test.ts tests/unit/compliance-quantity-actions.test.ts`
  - 4 files, 66 tests passed.
- Passed during `npm.cmd run build`: optimized compilation and Next.js TypeScript
  validation.
- `npm.cmd run typecheck` similarly exceeded the local 120-second limit without
  emitting an error; the build's TypeScript phase completed successfully.
- Passed: `git diff --check`.
- Local runtime check: restarted an unresponsive development server on port 3000
  with local database access. `/employees/cc` returned HTTP 200 and the server
  recorded no database-query access error for that request.
- Follow-up runtime check: a clean dev-server restart returned HTTP 200 for
  `/employees/dashboard`, `/employees` no longer returned 404, and the recent
  server log had no failed-query, access-denied, or DB-timeout entry.
- Passed: `npm test -- --run tests/unit/compliance-columns.test.ts tests/unit/cc-timeframes.test.ts`
  - 2 files, 21 tests passed.
- Passed: `GET /employees/cc?view=quarterly` returned HTTP 200 from the local
  development server after the frozen-column update.
- Passed: `npm test -- --run tests/unit/compliance-dashboard.test.ts tests/unit/compliance-columns.test.ts tests/unit/compliance-carry-forward.test.ts tests/unit/compliance-bulk.test.ts tests/unit/compliance-bulk-template.test.ts tests/unit/compliance-bulk-actions.test.ts tests/unit/cc-timeframes.test.ts tests/unit/compliance-quantity.test.ts tests/unit/compliance-quantity-actions.test.ts tests/unit/compliance-minutes.test.ts tests/unit/compliance-mcc-frequency.test.ts tests/unit/compliance-wcc-groups.test.ts tests/unit/compliance-statuses.test.ts tests/unit/compliance-wcc-mcc.test.ts`
  - 14 files, 249 tests passed.
- Passed: `GET /employees/cc?view=monthly` returned HTTP 200 from the running
  local development server.
- Passed: `npm test -- --run tests/unit/cc-timeframes.test.ts tests/unit/compliance-columns.test.ts`
  - 2 files, 21 tests passed.
- Passed: `GET /employees/cc?view=daily&date=2026-10-01` returned HTTP 200
  from the local development server.
- Passed: the 14-file focused Compliance Checklist suite (249 tests) after the
  frozen-rail visual adjustment; the Daily CC route returned HTTP 200.
- Database dry-run completed successfully but reports all 341 migrations as
  pending in this local database, including `0263`. It was deliberately not
  applied: applying the entire historical migration chain against an unknown
  local database is not a safe substitute for connecting the intended local
  snapshot. The new multi-date frequencies therefore require the normal
  environment migration process before use outside the tested code path.
- Inconclusive: `npm run typecheck` started `tsc --noEmit` but exceeded the
  local 60-second command allowance without reporting a TypeScript error.
- Inconclusive: direct ESLint for `components/compliance/compliance-board.tsx`
  exceeded the same local 60-second command allowance without reporting a
  lint error. The repository's `npm run lint -- --file ...` form is incompatible
  with its flat ESLint configuration, so it was not counted as a lint pass.

## Final verification update

- Passed: `npm test`
  - 392 test files passed, 5 skipped; 5,287 tests passed, 34 skipped.
- Passed: `NEXT_DIST_DIR=.next-build-test npm run build` completed optimized
  compilation, TypeScript validation, and full route generation. The isolated
  output directory was intentionally not committed.
- Passed: `git diff --check`.
- The build emitted two non-blocking Turbopack tracing warnings for dynamic
  filesystem access in `lib/billing/invoice-pdf.ts` and
  `lib/storage/objects.ts`; neither stopped compilation or route generation.
- Additional hardening included shared login-session minting for the session
  endpoint, corrected permission-route resolution for static HR routes,
  server-side master-admin protection for the permissions page, a founder-only
  incentive review/edit policy, and a corrected super-admin company-scope
  filter default. These changes preserve existing authorization boundaries.

## Follow-up / rollback

- Before merge, finish one unrestricted production build and exercise
  `/employees/cc` as an ordinary employee, a coordinator, and an approver.
- Resolve the local database baseline before running migrations. The current
  dry-run sees every migration as pending, so do not execute `db:migrate` on
  this connection until it is confirmed to be a fresh disposable database or
  its migration ledger is repaired from the approved baseline.
- The requested automatic `Automatic Not Filled` and `Absent` persisted status
  transitions require an agreed canonical status model and scheduled write path;
  they were not invented on top of the legacy status bridge.
- The existing add/edit dialog supports weekly day selection and the established
  monthly/quarterly/half-yearly/yearly schedules, including the new four-date
  variants. A free-form interval plus end-condition recurrence modal still
  needs durable recurrence fields and schedule-engine support before it can be
  made truthful.
- Category/tag fields and actual Google Calendar attendee invitations, video
  conferences, and cross-module scheduling cannot be safely represented by the
  present compliance schema or calendar adapter: it stores no category/tag,
  guest, conferencing, invite/consent, or collaboration-permission data and
  only writes the doer's summary calendar event. Implement those after agreeing
  the new data model, OAuth scopes, invitation sender, and retention rules.
- To roll back the browser migration, restore the deleted DCC route/UI files and
  repoint the navigation and permission catalogue. No data rollback is needed.
