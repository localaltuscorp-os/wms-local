# 06 — Incentive module rework already in the working tree

This work landed **before** the session that produced documents 01–05. It is included in the same push, so a reader of the diff needs it. Everything here was **verified as present and working**, not rebuilt.

Origin commit for the working tree: `639e165` (`Merge branch 'main' … into Om`). Everything below is uncommitted.

---

## 6.1 Reversal — negative payable adjustment

**The requirement this satisfies:** when an incentive is marked Reversed, a negative payable adjustment must be created for the amount already paid, appear in Accounts, offset the employee's payable, never be created twice, preserve the original payment, and be transactional and server-side.

| Piece | Path |
|---|---|
| Pure rule | `lib/incentive/reversal.ts` → `planEntryReversal(paidAmt, alreadyReversed)` |
| Server action | `app/(app)/incentive/reversal-actions.ts` → `reverseIncentiveEntry({ id, note? })` |
| UI | `components/incentive/incentive-entries.tsx:57-77` (`confirmReverse()`, shared `ConfirmDialog`) |
| Migration | `db/migrations/0240_incentive_entry_reversal.sql` |
| Tests | `tests/unit/incentive-reversal.test.ts` |

**Flow** (`reversal-actions.ts:42-123`):

1. `requireAdmin()`, rate limit, zod-validated input (`.strict()`).
2. One `db.transaction`; re-read the entry `.for("update")` — a row lock, so two concurrent reversals serialise.
3. Duplicate guard on the locked row: `planEntryReversal(Number(entry.paidAmt), entry.reversed)` → if `alreadyReversed`, return `{ skipped: true }` and write nothing. **This is the "never twice" guarantee**, enforced under the lock rather than by a check that can be raced past.
4. If `plan.shouldReverse`, insert an `incentive_payout_events` audit row with a **negative** amount (`source: 'entry'`, `sourceId: entry.id`, `salaryRunId: entry.payoutRunId`, note prefixed `reversal ·`).
5. Insert the negative **`salary_payments`** row — `kind: 'incentive'`, `method: 'reversal'`, `amount: plan.reversalAmount` (negative), linked by `incentiveEntryId`, `month` from the entry's period.
6. Mark the entry: `reversed: true, reversedAt, reversedById`. **The only writer of those three columns.**
7. Revalidate `/salary/incentive-payout`, `/salary`, `/incentive`.

**Preservation of the original record:** `paid_amt`, `paid`, `paid_date` and `payout_run_id` are all left exactly as they were. The reversal is a separate, dated, auditable row rather than an edit. That is why the entry ledger still shows the full original payment and the adjustment sits beside it.

**Amounts:** unpaid → no adjustment (`shouldReverse: false`, amount 0). Fully paid → `−paid`. Partially paid → `−paid` (only what actually moved). Negative or `NaN` paid amounts are treated as unpaid.

**How it reaches Accounts:** the Accounts incentive ledger (document 02) reads these `method = 'reversal'` rows and subtracts them in `finalPayable`.

**What it does not do:** there is no employee notification on a reversal. The requirement did not ask for one and the module's event matrix has no reversal-entry notice. Flagged as a product question in `07-files-changed.md`.

---

## 6.2 Sunday 11:00 IST employee report card

**The requirement this satisfies:** every Sunday at 11:00 IST, an individual report per active employee, emailed, excluding inactive/left employees, containing grade, current month, last month, last 3 months, last 6 months, YTD, incentive earned, target, actual, deficit/surplus, current rank, previous rank and rank movement — reusing the existing analytics layer.

| Piece | Path |
|---|---|
| Cron route | `app/api/cron/incentive-weekly-report/route.ts` |
| Schedule | `vercel.json:32-34` → `{"path": "/api/cron/incentive-weekly-report", "schedule": "30 5 * * 0"}` |
| Data loader | `lib/queries/incentive-weekly-report.ts` → `loadIncentiveWeeklyReport(now)` |
| Period assembly (pure) | `lib/incentive/analytics/weekly-report.ts` |
| Email template | `emails/notifications/IncentiveWeeklyReportCard.tsx` |
| Sender | `lib/email/resend.ts:696` → `sendIncentiveWeeklyReportEmail` |
| Tests | `tests/unit/incentive-weekly-report.test.ts` |

**Timing:** `30 5 * * 0` = Sunday 05:30 UTC = **11:00 IST**. The half-hour offset is the point — an `0 5 * * 0` schedule would be 10:30 IST. Pinned by a test that reads `vercel.json` and asserts the exact expression.

**No second calculation.** The route composes five windows (`weeklyReportSelections`: `current_month`, `last_month`, `last_3`, `last_6`, `ytd`) and runs each through the **existing** `buildIncentiveAnalytics` via `loadIncentiveWeeklyReport`. Grade, % of CTC, rank, previous rank and movement all come from `lib/incentive/analytics/` — the route recomputes nothing. A test asserts the route, query and pure files contain no hard-coded grade bands (`/> 20|10\.01|5\.01/`) and no `.sort((` of their own.

**Recipient selection:** `eq(employees.isActive, true)`, then per employee a card must exist. Address from `businessEmailFor({ email, officialEmail })` — the work mailbox (`official_email`), falling back to the login address, which is the org's convention for work-capacity mail.

**Per-recipient failure isolation:** a `for…of` loop with a per-recipient `try/catch`, counters `{ processed, sent, skipped }`, and `console.error` per failure. One bad address cannot stop the run.

**Duplicate delivery prevention:** a claim row in `incentive_notification_deliveries` with `versionKey = week:<IST YYYY-MM-DD>` (`weeklyReportVersionKey`), inserted with `onConflictDoNothing` **before** the send. A re-run in the same week claims nothing and sends nothing.

**Authentication:** the house `CRON_SECRET` bearer check, with the constant-shape rejection that never reveals whether the secret is configured.

**Inactive/left exclusion** happens at both levels: the SQL `is_active` filter and, per delivery, the shared `isActiveEmployee` predicate.

---

## 6.3 Paid notification through the Entries editor

**The requirement this satisfies:** when `paidAmt` actually increases through the Entries editor, the employee must receive the same paid notification and email as the Status editor and the salary payout.

| Piece | Path |
|---|---|
| Helper | `lib/incentive/notifications/paid-increase.ts` → `notifyIfPaidIncreased` |
| Entries call site | `app/(app)/incentive/admin-actions.ts:153-165` (import at `:19`, old amount pre-read at `:122-130`) |
| Status call sites | `app/(app)/incentive/status-actions.ts:96`, `:183`, `:321` |
| Payout call site | `app/(app)/salary/incentive-payout/actions.ts:290` → `notifyIncentivesPaid` |
| Tests | `tests/unit/incentive-notifications.test.ts`, `tests/unit/incentive-reversal.test.ts:79-90` |

**Note for a reader of the audit:** `Incentive-Implementation-Audit.md` §9.3 records this as an open gap (`🔴 Entries editor contains no notify call`). **That audit line is stale.** The call is present and the branch is closed. The helper only fires when the amount genuinely increased (`increase <= 0` returns early) and only when an `employeeId` exists, which is the "do not send when unchanged" rule.

**Idempotency preserved:** `versionKey = <leg>-paid:<total>:<date>`, claimed in `incentive_notification_deliveries` before dispatch, released if the send fails. A repeat save of the same amount re-claims the same key and sends nothing.

**Inactive recipients:** the shared `deliverIncentiveNotification` returns `"inactive"` before dispatch.

**Not yet covered by the same call:** `createIncentiveEntry` and `bulkUploadIncentiveEntries` do not notify on a newly created entry that is already marked paid. Only the update path does. Same class of gap, smaller blast radius (bulk import is an admin backfill). Worth a decision.

---

## 6.4 Incentive Master (Admin panel) and eligibility

| Piece | Path |
|---|---|
| Schema | `db/migrations/0232_incentive_master.sql` (adds `incentive_type`, `product_id`, `duration`, `valid_until` to `incentive_catalog`) |
| Admin page | `app/(admin)/admin/incentive-master/{page.tsx,actions.ts}` |
| Workspace UI | `components/admin/incentive-master/` |
| Query layer | `lib/queries/incentive-master.ts` |
| Domain | `lib/incentive/master.ts` |
| Authorization | `lib/incentive/eligibility-guard.ts` → `mayManageIncentiveEligibility()` |
| Verify harness | `scripts/verify-incentive-master.ts`, `scripts/verify-incentive-eligibility.ts` |
| Tests | `tests/unit/incentive-master.test.ts`, `tests/unit/incentive-master-authorization.test.ts` |

- **Eligibility stays in the Admin panel.** Reachable only from `/admin/incentive-master`, behind `requireAdmin()` + `requireModuleView("admin.incentive.master")`. The in-module Incentive Table dialog cannot edit it. No relocation was made.
- **Authorization is the module's strongest gate.** `mayManageIncentiveEligibility()` resolves **both** the effective employee (the account in use) and the real employee (the person using it) and requires the capability of both. It fails closed. The page calls the same function to decide what renders, so "visible" and "permitted" cannot disagree.
- **Event-sourced notifications.** Catalog and eligibility writes record an event row inside the transaction (`recordIncentiveCatalogEvent`) and process it after the response (`processIncentiveCatalogEvent`). A crash between commit and send leaves a durable event, not a lost notification.
- The workspace's taxonomy filter is labelled **"Function / Department"** — there is only one column behind it (`candidateRow.departmentId`). A genuinely separate department taxonomy would be a schema change, not an Incentive one.

---

## 6.5 Departments → Functions rename

| Piece | Path |
|---|---|
| Migration | `db/migrations/0234_functions_replace_departments.sql` |
| Admin page | `app/(admin)/admin/functions/{page.tsx,actions.ts}` (new) |
| Deleted | `app/(admin)/admin/departments/actions.ts` |
| Verify harness | `scripts/verify-functions-rename.ts` |
| Tests | `tests/unit/functions-rename.test.ts` |

The migration copies `departments` → `functions`, re-points `employees.department_id` where the id exists in `functions`, and nulls the rest. It is written to be re-runnable. **This is the one change in the push that moves identity data**, so it is the one to read carefully before running anywhere new — see `SQL/README.md`.

---

## 6.6 `salary_payments` read path

| Piece | Path |
|---|---|
| Query | `lib/queries/incentive-payments.ts` → `getIncentivePaymentLedger(month?)` |
| Rendered by | `app/(app)/salary/incentive-payout/page.tsx:160-249` (`PaymentLedgerSection`) |

`salary_payments` had been write-only since migration `0115`. This is its first reader: the positive payout rows (`method = 'with_salary'`) and the negative reversal rows (`method = 'reversal'`), folded per employee into `grossPaid`, `reversal` and `netPaid`. It makes the payout observable and is what the Accounts ledger in document 02 builds on for the reversal figure.

---

## 6.7 Incentive UI kit and the presentation restructure

New shared primitives under `components/incentive/ui/`, introduced to collapse duplicates that had drifted apart:

| File | Replaces |
|---|---|
| `chrome.tsx` | five section wrappers at four radii; four segmented controls at four geometries |
| `kpi.tsx` | six near-identical KPI card implementations |
| `badges.tsx` | the status pill and grade badge, so a state cannot read one way on the dashboard and another on the requests list |
| `tone.ts` | hard-coded accent hexes and attainment thresholds |
| `states.tsx` | eight empty states |
| `confirm-dialog.tsx` | three destructive-action standards |

Plus `app/(app)/incentive/loading.tsx` (new) painting the dashboard's shape while it streams, and a rail-order change in `components/layout/main-nav.tsx` (Dashboard · Requests · Targets · Entries · Status · Billing), pinned by `tests/unit/incentive-module.test.ts` as rail ≡ page areas.

`components/admin/ui/data-table.tsx` gained optional props (`renderRowDetail`, `initiallyExpandedKeys`, `pageSize`, `stickyFirstColumn`, `footerRow`). All default to the previous behaviour, so the ~15 other admin screens using it are unaffected.

---

## Verified but not rebuilt

The following were checked end to end and found complete, so no code was written for them:

- request / approval / rejection / resubmission state machine and its history protection (`lib/incentive/workflow.ts`, `workflow-server.ts`, `db/migrations/0230`),
- the request form and its Client Permission coverage (`lib/incentive/prepare-request.ts`),
- split incentives (`lib/incentive/split.ts`, `db/migrations/0229`),
- incentive exports (`app/(app)/incentive/export.pdf/route.ts`, `export.xlsx/route.ts`, `lib/exports/incentive-catalog*.ts`),
- deep links (`?request=`, `?view=table`, `?tab=`, `?year=`),
- mobile API behaviour — unchanged.

## Known gaps carried forward

1. **Reversal sends no notification** (§6.1).
2. **`createIncentiveEntry` / bulk import do not notify** (§6.3).
3. **The monthly digest cron has no delivery claim** (`app/api/cron/incentive-digest/route.ts`), so a manual re-run re-sends it. Every other incentive notification is claimed.
4. **Split incentives do not divide the payment.** The split is saved, shown and used on the dashboard, but Accounts still pays as before.
5. **Leads / Referrals requests have no automatic amount** — an admin sets it.
6. **The Android app was not updated** for the new statuses, split or resubmission.
7. **Two `nameKey` implementations exist** (`lib/incentive/payout-sources.ts:33` exported, `lib/queries/incentives.ts:78` private). Identical today; a drift risk.
8. **The payout page's `GREEN` / `GREEN_DEEP` constants hold red values** (`#E10600` / `#A80400`). Cosmetic, but a trap for the next reader.
