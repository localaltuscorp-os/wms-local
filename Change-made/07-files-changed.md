# 07 — File inventory, verification, and open questions

Working tree relative to `639e165` (`Merge branch 'main' … into Om`). Nothing is committed.

```
100 modified · 47 untracked · 1 deleted
```

Untracked entries count whole new directories (`?? dir/`), so the number of new files is larger than 47.

---

## New files

### Incentive and Accounts — this session

```
lib/queries/incentive-accounts.ts                                  scoped payable ledger + deriveIncentivePayable
lib/incentive/analytics/visible-names.ts                           scope → name keys (sheet-backed surfaces)
lib/incentive/notify-breakup.ts                                    breakup letter on the payment edge
app/(app)/accounts/incentive-payments/page.tsx                     the Accounts incentive page
app/(app)/incentive/billing-actions.ts                             Team/User reload for the Billing ledger
components/accounts/incentive/accounts-scope-switch.tsx            the Team/User control
components/accounts/incentive/incentive-accounts-table.tsx         the payable table
tests/unit/incentive-accounts-ledger.test.ts                       16 tests
tests/unit/incentive-billing-scope.test.ts                         14 tests
tests/unit/incentive-breakup-mail.test.ts                          12 tests
tests/unit/incentive-payout-breakup.test.ts                        14 tests
```

### Incentive — prior session

```
app/(app)/incentive/loading.tsx                                    streaming skeleton
app/(app)/incentive/reversal-actions.ts                            the reversal server action
app/(app)/salary/incentive-breakup/                                breakup PDF route
app/api/cron/incentive-weekly-report/                              Sunday 11:00 IST report card cron
components/incentive/ui/                                           chrome · kpi · badges · states · tone · confirm-dialog
components/admin/incentive-master/                                 admin workspace
app/(admin)/admin/incentive-master/                                admin page + actions
app/(admin)/admin/functions/                                       departments → functions
emails/notifications/IncentiveWeeklyReportCard.tsx                 report card email
lib/incentive/reversal.ts                                          planEntryReversal
lib/incentive/breakup.ts                                           incentive breakup query
lib/incentive/breakup-pdf.ts                                       incentive breakup PDF
lib/incentive/eligibility-guard.ts                                 mayManageIncentiveEligibility
lib/incentive/master.ts                                            incentive master domain
lib/incentive/notifications/paid-increase.ts                       notifyIfPaidIncreased
lib/incentive/analytics/weekly-report.ts                           weekly report period assembly
lib/queries/incentive-master.ts
lib/queries/incentive-payments.ts                                  first salary_payments reader
lib/queries/incentive-weekly-report.ts
db/migrations/0232_incentive_master.sql
db/migrations/0234_functions_replace_departments.sql
db/migrations/0240_incentive_entry_reversal.sql
scripts/verify-incentive-master.ts
scripts/verify-incentive-eligibility.ts
scripts/verify-functions-rename.ts
tests/unit/incentive-reversal.test.ts
tests/unit/incentive-weekly-report.test.ts
tests/unit/incentive-dashboard-scope.test.ts
tests/unit/incentive-module.test.ts
tests/unit/incentive-master.test.ts
tests/unit/incentive-master-authorization.test.ts
tests/unit/functions-rename.test.ts
```

### Documentation (not code)

```
Incentive-Implementation-Audit.md        the gap analysis this work was scoped from
Incentive-UI-UX-Audit.md
Incentive-UI-UX-Findings.md
Change-made/                             this folder
```

---

## Modified files

### Incentive module (18)

```
app/(app)/incentive/page.tsx                          Billing tab scoped server-side; scope wiring
app/(app)/incentive/admin-actions.ts                  Entries paid notice (notifyIfPaidIncreased)
app/(app)/incentive/analytics-actions.ts              period + view action
app/(app)/incentive/catalog-actions.ts                event-sourced catalog writes
app/(app)/incentive/status-actions.ts                 3× notifyIfPaidIncreased
app/(app)/salary/incentive-payout/actions.ts          + breakup mail on the payment edge
app/(app)/salary/incentive-payout/page.tsx            payment ledger section
components/incentive/analytics/incentive-analytics-dashboard.tsx   summary bar, status cards, breakup link
components/incentive/billing-dashboard.tsx            Team/User control
components/incentive/incentive-dashboard.tsx          charts mount only when open
components/incentive/incentive-entries.tsx            DataTable, reversal UI
components/incentive/incentive-form-dialog.tsx        trigger only
components/incentive/incentive-list.tsx
components/incentive/incentive-status-pill.tsx
components/incentive/incentive-status-report.tsx
components/incentive/incentive-status-tab.tsx
components/incentive/incentive-tabs.tsx
components/incentive/incentive-targets.tsx
components/salary/incentive-payout-panel.tsx          breakup link per row
lib/incentive/analytics/model.ts                      + scope.viewerId (additive)
lib/incentive/analytics/scope.ts                      reverted to its original import surface
lib/incentive/notifications/{content,eligibility,kinds,service}.ts
lib/queries/incentive-analytics.ts
lib/queries/incentives.ts
lib/queries/billing.ts                                scope-aware, filters before aggregation
db/schema.ts                                          incentive + function tables
db/enums.ts
vercel.json                                           + incentive-weekly-report cron
```

### Accounts

```
app/(app)/accounts/page.tsx       cross-module links
lib/accounts/sections.ts          Incentive (order 0) + Reimbursement link (order 1)
```

### Departments → Functions rename (this is why the diff is wide)

```
app/(admin)/admin/departments/page.tsx      (actions.ts deleted — replaced by admin/functions/)
components/admin/admin-nav-config.ts
components/admin/create-department-dialog.tsx
components/admin/department-list.tsx
components/admin/department-multi-select.tsx
components/admin/edit-employee-dialog.tsx
components/admin/employee-editor/index.tsx
components/admin/employee-list.tsx
components/admin/employee-master/bulk-edit-dialog.tsx
components/admin/employee-master/master-table.tsx
components/admin/employee-master/workspace.tsx
components/admin/invite-employee-dialog.tsx
components/admin/previous-employees.tsx
components/attendance/insights/org/{department-table,drill-table,org-dashboard}.tsx
components/layout/filters/department-filter.tsx
components/profile/identity/locked-fields-card.tsx
lib/employees/master-query.ts
lib/permissions/catalog.ts
lib/security/capabilities.ts
lib/validators/department.ts
lib/workspaces.ts
```

### Wider UI / theme / navigation polish (prior session)

```
app/layout.tsx                                     + data-scroll-behavior
app/(app)/{communications,hub,privacy}/…
app/(app)/pms/[employeeId]/page.tsx
app/(app)/tasks/time/manager/page.tsx
app/(app)/training/induction/page.tsx
app/api/admin/exit-register/route.ts
components/admin/ui/data-table.tsx                 optional props only
components/agreements/workbench.tsx
components/attendance/{insights/ai,insights/finance,leave}/…
components/communications/broadcast-composer.tsx
components/dashboard/{bottom-performers,top-performers,done/done-dashboard-view}.tsx
components/goals/team/team-performance-board.tsx
components/hr/{candidate,exit,job-description,record}/…
components/hub/module-logos.tsx
components/layout/main-nav.tsx                     rail order
components/my-day/dashboard/dashboard-view.tsx
components/tasks/task-detail-view.tsx
components/tasks/time/reports/…
components/training/{induction-progress,material-form,material-viewer}.tsx
components/weekly-goals/weekly-goals-dashboard.tsx
lib/ai/attendance-workforce-insights.ts
lib/goals/template-columns.ts
lib/hr/candidate/intake-schema.ts
lib/module-theme.ts
lib/shortcuts-catalog.ts
lib/email/{report-emails,resend}.ts                 + sendIncentiveBreakupEmail
tests/unit/hub-letter-shortcuts.test.tsx
tests/unit/module-shortcut-letters.test.ts
tests/unit/incentive-analytics.test.ts
```

### Deleted

```
app/(admin)/admin/departments/actions.ts    replaced by app/(admin)/admin/functions/actions.ts
```

---

## Verification

```
npx tsc --noEmit                exit 0
npx eslint (16 changed files)   clean, except one pre-existing warning (below)
incentive + accounts tests      17 files, 514 tests passed
full unit suite                 tests/unit — 3528 tests: 3520 passed, 7 failed, 1 skipped
```

### The pre-existing eslint warning

`app/(app)/incentive/page.tsx:110` — `Cannot call impure function during render: Date.now`. Present before this work; the line computes the IST reference month for the Status tab. Not introduced and not fixed here.

### Known failing tests, not caused by this work

`tests/unit`:

```
delegated-access-authorization.test.ts   (1 failed)
device-exemption-login.test.ts           (1 failed)
done-on-time.test.ts                     (1 failed)
global-search-provider.test.tsx          (1 failed)
task-actions.test.ts                     (2 failed)
task-stat-counts.test.ts                 (0 tests — load failure)
```

**Evidence they are pre-existing.** None of those six files imports any module this work touched. Checked by extracting the complete import graph of each failing file and searching for `incentive`, `accounts`, `billing`, `report-emails`, `breakup`, `notify` and `analytics` — zero hits in all six. `Incentive-Implementation-Audit.md` §11.4 separately records the same files failing before this work (it lists 14 failures in 9 files at that time; the count differs because the audit measured an earlier working tree, but the failing files are the same families).

The failures are in task actions, delegated access, device login, global search and done-on-time — none of which this change set touches.

---

## Open questions and residual risk

Ordered by how much they would cost to discover late.

1. **Reversal sends the employee no notification.** The requirement did not ask for one; the audit's event matrix has no reversal-entry notice. But a clawback the employee is never told about is the same silent-money problem that §6.3 fixed for payments. Product call.
2. **`createIncentiveEntry` and `bulkUploadIncentiveEntries` do not notify.** Only the update path does. A newly created entry that is already marked paid pays silently. Same class of gap as §6.3, smaller blast radius.
3. **The monthly digest cron has no delivery claim** (`app/api/cron/incentive-digest`). A manual re-run re-sends the digest. Every other incentive notification claims its delivery.
4. **`incentive_requests` is missing nine columns the schema's `ensure` list expects** — see `SQL/README.md`. Harmless today because no code path reads or writes them, but any future INSERT that touches them fails on the first missing one.
5. **The reversal's `paid_amt` is deliberately not reduced**, so `getIncentivePaidByPerson` (`lib/queries/incentives.ts:351`) and the payout board still report the full reversed amount as paid. `payNow = max(0, ceiling − alreadyPaid)` means a re-run pays 0 for that leg, so no double payment is possible — but any *reporting* surface that does not read the negative rows will overstate paid. The Accounts ledger and the payment ledger both do read them; the payout board does not.
6. **Two `nameKey` implementations** (`lib/incentive/payout-sources.ts:33` exported; `lib/queries/incentives.ts:78` private). Identical today.
7. **37 migrations are unapplied per `apply-all-migrations.ts`'s own dry run**, but their objects exist in the database and `__schema_applied` lists the incentive ones. The two ledgers disagree. Do not run the bulk applier against the live database on the strength of that dry run — its own header warns it re-attempts `0029`–`0104` on a populated database.
8. **No test renders the breakup PDF.** `getIncentiveBreakup` and `renderIncentiveBreakupPdf` have no unit test. The new mail tests mock both.
