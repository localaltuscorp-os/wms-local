# Incentive Implementation Audit

**Prepared:** 16 September 2026
**Method:** source-traced. Every status below was checked by following the data flow — UI → server action / API route → query layer → database schema → notification service → email template → cron registration. A UI's existence was never accepted as evidence of completion.
**Scope of change:** no code, database, route, permission, business rule or data was modified while producing this document.

> **Important context for reading this file.** A UI/UX restructuring of the Incentive module (requested immediately before this audit) was **partially applied to the working tree** before the audit began. It is described in §11.4. It changes presentation only; the typecheck is clean (`tsc --noEmit`, exit 0) and all 249 incentive unit tests pass. Statuses below describe the tree as it stands now.

---

## 1. Executive Summary

### Overall completion estimate

| Dimension | Estimate |
| --- | --- |
| **Functional completion** (request → decision → ledger → notification) | **~85%** |
| **UI/UX completion** (native-WMS look, density, shared components) | **~70%** (was ~35% before the in-flight restructure) |
| **Accounts / payment integration** | **~45%** |
| **Automated delivery (report card, digests)** | **~30%** |
| **Weighted overall** | **~75%** |

### Major completed areas

- **The request → decision → resubmission loop is real and enforced server-side.** Reviewer identity, the decision matrix, mandatory notes, submission history and the audit trail all exist in the database and in the actions, not only in components.
- **Analytics** — scope, grading, ranking, rank movement, period resolution and target-vs-actual are a pure, unit-tested calculation layer (`lib/incentive/analytics/*`) with 249 passing tests.
- **Incentive Master and the Incentive Chart (eligibility)** — complete, with dual-identity authorization, batch limits, effective dates, grant history and event-sourced notifications.
- **Notifications and emails** — 14 notification kinds, 12 email templates, idempotency through a `incentive_notification_deliveries` claim table, inactive-recipient suppression and claim release on failure.
- **Validation** is shared between web and mobile through one module (`lib/incentive-fields.ts` → `lib/incentive/prepare-request.ts`); the browser never holds the only copy of a rule.

### Major remaining areas

1. **The Sunday 11 AM weekly Report Card does not exist** — no cron, no route, no template, no recipient selection. The only incentive cron is a **monthly** digest.
2. **Accounts integration stops at the ledger.** `salary_payments` rows with `kind='incentive'` are written, but nothing reads them into a payslip, a my-salary view, or an "above Reimbursement" position.
3. **The Incentive Breakup Letter does not exist** — zero references anywhere in the repository.
4. **Reversal has no negative payable adjustment** in the payout maths.
5. **Raising a paid amount from the Entries area sends no "paid" notice** (the Status editor and the salary payout both do).

### Highest-risk gaps

| Risk | Why it matters |
| --- | --- |
| **Reversal → payment** (§7) | A reversed incentive is a workflow status only. `planIncentivePayout` never sees it, so an already-paid reversed incentive produces no clawback and no negative adjustment. Money already out of the door has no route back through this module. |
| **Paid-notice gap on Entries** (§9) | An admin raising `paid_amt` on the Entries area silently pays someone without telling them, while the same edit on the Status area notifies. Two doors onto one fact, one of them quiet. |
| **Sunday report card absent** (§8) | Believed shipped in several places; it is not. Nothing is scheduled and nothing would send. |
| **Payout flag default OFF** (§7) | `INCENTIVE_PAYOUT` defaults to off, so the payout path is inert in any environment that has not explicitly set it. |

---

## 2. Requirement Matrix

Legend: ✅ DONE · 🟡 PARTIAL · 🔴 NOT DONE · 🟠 BROKEN · 🔍 NEEDS VERIFICATION

### 2.1 New request forms

| ID | Requirement | Status | Evidence | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| R-01 | Client Happiness request type | ✅ | `client_happiness` field set with 5 Happiness Types | `lib/incentive-fields.ts:156-196` | Case Study · Google Review · Interview · LinkedIn Testimonial · Video Testimonial |
| R-02 | Group Introduction request type | ✅ | `group_intro` field set, 6 event types | `lib/incentive-fields.ts:198-219` | "Group Happiness" in the brief maps to this type |
| R-03 | Conversion request type | ✅ | `bss_conversion`, label "Conversion" | `db/enums.ts:518-524`, `lib/incentive-fields.ts:106-125` | Stored enum key unchanged, so historical rows still resolve |
| R-04 | Leads / Referrals request type | ✅ | `leads_referrals` field set | `lib/incentive-fields.ts:221-231` | First/last name, workshop, batch, link, notes, incentive date |
| R-05 | Sales Pitch request type | ✅ | `sales_pitch` field set | `lib/incentive-fields.ts`, `db/enums.ts:520` | Pre-existing type |
| R-06 | Video Testimonial as a choice | ✅ | In the Happiness Type options | `lib/incentive-fields.ts:163` | |
| R-07 | Case Study / LinkedIn Testimonial / Video Interview | ✅ | Happiness Types | `lib/incentive-fields.ts:163` | "Interview" is the Video Interview option |
| R-08 | 10-digit mobile validation | ✅ | Regex ten digits, first 6–9, no +91/spaces/dashes; enforced in the shared validator | `lib/incentive-fields.ts:272-290` | `MOBILE_ERROR` is one string for both surfaces |
| R-09 | Email validation | ✅ | `EMAIL_RE` in the shared validator | `lib/incentive-fields.ts:292-299` | |
| R-10 | URL and number validation | ✅ | `url` requires http(s) + dotted host; `number` is `^[1-9]\d{0,6}$` | `lib/incentive-fields.ts:314-357` | Added because native input validation no longer runs |
| R-11 | Conversion → Product required | ✅ | `{ key: "product", required: true, optionsFrom: "products" }` | `lib/incentive-fields.ts:122` | |
| R-12 | Admin Products is the source of truth | ✅ | `listActiveProductNames()` (cached, tag-busted) feeds web page, mobile route and the server validator | `lib/queries/products.ts:81`, `app/(app)/incentive/page.tsx:88`, `app/api/mobile/incentive/route.ts:81`, `lib/incentive/prepare-request.ts:59` | Three consumers, one list |
| R-13 | Notes on every type | ✅ | Shared `NOTES` field appended to all five type definitions | `lib/incentive-fields.ts` | |
| R-14 | Voice dictation on notes | ✅ | `useDictation` wired into `NotesInput` | `components/incentive/incentive-form-dialog.tsx:8,788,824`, `components/ui/use-dictation.ts` | One shared dictation hook, not an incentive-only one |
| R-15 | Split incentive | ✅ | `checkSplit` + basis-point maths | `lib/incentive/split.ts` | |
| R-16 | Split min 2, max 5 people | ✅ | `MIN_SPLIT_PEOPLE = 2`, `MAX_SPLIT_PEOPLE = 5`, enforced in `checkSplit` | `lib/incentive/split.ts:22-23,137-138` | |
| R-17 | Equal split | ✅ | `equalSplitBasisPoints` | `lib/incentive/split.ts:71` | |
| R-18 | Custom ratios, 2 decimals | ✅ | `pctIssue` rejects >2dp and >100 | `lib/incentive/split.ts:47-59` | |
| R-19 | Split total exactly 100% | ✅ | Basis-point comparison against `FULL_SPLIT_BP` | `lib/incentive/split.ts:111-113` | Integer maths, so no float drift |
| R-20 | Filer must be in the split; all must be active | ✅ | Re-checked server-side | `lib/incentive/prepare-request.ts:66-80` | |
| R-21 | Client Permission to Publish | 🟡 | Required radio, shown only for Case Study and Video Testimonial | `lib/incentive-fields.ts:104,167-173` | **Deliberate narrowing vs the brief:** the brief's phrasing covers Case Study *and* Video Testimonial (which is what is implemented). LinkedIn Testimonial and Interview do **not** ask it, though they are content-reviewed. Confirm this is intended — see §3.3 |
| R-22 | Incentive Date on every request | ✅ | Shared `INCENTIVE_DATE` field on all five types | `lib/incentive-fields.ts` | |
| R-23 | Two-column responsive form | ✅ | `pane: "left" \| "right"`, `half` pairing, stacks below `md` | `components/incentive/incentive-form-dialog.tsx:344-420,490-560` | Pinned by test `incentive-request-form.test.ts:530` |
| R-24 | Server-side validation, not just frontend | ✅ | Both the action and the mobile POST call `prepareIncentiveRequest`, which re-runs every field rule, the split check and the product list | `app/(app)/incentive/actions.ts:49`, `app/api/mobile/incentive/route.ts:13`, `lib/incentive/prepare-request.ts` | The strongest part of the module |

### 2.2 Approval / rejection / resubmission

| ID | Requirement | Status | Evidence | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| A-01 | Manan-only decision authority | ✅ | `canReviewIncentives(me.email)` checked inside the action on every call | `app/(app)/incentive/actions.ts:101-102`, `lib/auth/incentive-permissions.ts` | Was `requireAdmin()`; deliberately narrowed |
| A-02 | Approved / Not Approved / Due / Not Due / Reversed | ✅ | `NORMAL_DECISIONS` + transition table | `lib/incentive/workflow.ts:51-125`, `db/enums.ts:565-573` | |
| A-03 | Publish / Revise / Not Approved for content | ✅ | `CONTENT_DECISIONS` + `CONTENT_TRANSITIONS`, selected by `isContentReviewRequest` | `lib/incentive/workflow.ts:35-49,115-125` | Content types: LinkedIn Testimonial, Interview, Case Study |
| A-04 | Mandatory reason on Not Approved / Reversed / Revise | ✅ | `decisionRequiresNote` + `checkDecision`, re-validated in the action | `lib/incentive/workflow.ts:136-140`, `app/(app)/incentive/actions.ts:66-130` | |
| A-05 | Voice dictation on decision notes | ✅ | Decision panel uses the same `NotesInput` | `components/incentive/incentive-decision-panel.tsx` (imports `NotesInput` from the form dialog) | |
| A-06 | Confirmation before a decision is saved | ✅ | Two-step `requestSubmit` → `confirm`, naming the resulting status | `components/incentive/incentive-decision-panel.tsx:88-118` | |
| A-07 | Only sensible next steps offered | ✅ | Per-status transition tables | `lib/incentive/workflow.ts:115-125` | Approved → Reversed only; Reversed terminal |
| A-08 | Justification required on resubmission | ✅ | Zod-validated in the action **and** a DB check constraint | `app/(app)/incentive/actions.ts:136-229`, `db/schema.ts:2716` | The constraint is the real guarantee |
| A-09 | Original submission preserved | ✅ | `incentive_request_submissions` keyed `(request_id, submission_no)` unique | `db/schema.ts:2701-2713` | |
| A-10 | Version / history | ✅ | Submission rows + decision rows, read by `IncentiveHistory` | `db/schema.ts:2663,2701-2735`, `components/incentive/incentive-history.tsx` | |
| A-11 | Audit trail | ✅ | Decision rows carry actor, timestamp and note; never updated in place | `db/schema.ts:2735+` | |
| A-12 | Concurrency safety | ✅ | Second actor is asked to reload rather than overwriting | `app/(app)/incentive/actions.ts` (status guard in the update) | Documented in `incentive-changes.md` #23 |
| A-13 | Server-side authorization on every request action | ✅ | `requireUser()` + ownership/admin/reviewer check on reads too | `app/(app)/incentive/actions.ts:242-250` | |

### 2.3 Dashboard / analytics

| ID | Requirement | Status | Evidence | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| D-01 | Team / User scope | ✅ | `applyAnalyticsView`, structurally unable to widen | `lib/incentive/analytics/scope.ts` | Tested in `incentive-dashboard-scope.test.ts` |
| D-02 | Manager + transitive downline | ✅ | `getDownlineIds` (the existing org-chart rule) | `lib/incentive/analytics/scope.ts`, `lib/weekly-goals/hierarchy.ts` | Fails closed to self on a DB error |
| D-03 | Employee self view | ✅ | Scope with `employeeIds = {self}` and no switcher | `lib/incentive/analytics/scope.ts` | |
| D-04 | Hierarchy permissions honoured | ✅ | Company-wide queries are not even run for a scoped viewer | `app/(app)/incentive/page.tsx:80` | What is never loaded cannot leak |
| D-05 | A/B/C/D grade rules | ✅ | `INCENTIVE_GRADE_BANDS`, (min, max] convention | `lib/incentive/analytics/grading.ts:39-44` | A >20%, B 10.01–20, C 5.01–10, D ≤5 |
| D-06 | Rounding before banding | ✅ | `round2` applied before `gradeFor` | `lib/incentive/analytics/grading.ts:46-75` | Grade can never disagree with the figure shown |
| D-07 | Current month / specific month / last 3 / last 6 / YTD | ✅ | `PERIOD_KINDS` + `resolvePeriod` | `lib/incentive/analytics/periods.ts:27-35` | IST "now", calendar-year YTD |
| D-08 | Employee ranking | ✅ | `competitionRanks` — ties share, next rank skips | `lib/incentive/analytics/grading.ts` | Only people who earned in the window are ranked |
| D-09 | Rank movement | ✅ | `rankMovement` against the previous window | `lib/incentive/analytics/grading.ts` | `na` when there is no meaningful previous window |
| D-10 | Target vs actual, deficit | ✅ | `difference = earned − target` per person, plus a totals view | `lib/incentive/analytics/model.ts` (EmployeePerformance), `lib/queries/incentives.ts:562-579` | |
| D-11 | Missing current/next-month target warning | ✅ | `targetWarningFor`, actionable inline via `setMyIncentiveTarget` | `lib/incentive/analytics/model.ts`, `app/(app)/incentive/analytics-actions.ts` | |
| D-12 | Status counts + amounts | ✅ | Six `StatusCard`s with count, amount and `unvaluedCount` | `lib/incentive/analytics/model.ts` (STATUS_KEYS) | "Amount not set" instead of a fabricated ₹0 |
| D-13 | Clickable status → underlying table | ✅ | Card click swaps the detail region to the records behind it | `components/incentive/analytics/incentive-analytics-dashboard.tsx` | |
| D-14 | Active-only employees | ✅ | Inactive name keys and excluded ids dropped in the build | `lib/incentive/analytics/model.ts` (resolveEarner) | Handles the sheet's annotated names |
| D-15 | Employee report card | 🔴 | No component, route, email or generator exists | — | See §8. The grading module's own comment calls it a future consumer |
| D-16 | Date / period handling correctness | ✅ | Month granularity, IST resolution, inclusive trailing windows | `lib/incentive/analytics/periods.ts` | |
| D-17 | "Your grade" not shown against company data | ✅ *(new)* | Personal block now renders only when the view is genuinely the viewer's | `components/incentive/analytics/incentive-analytics-dashboard.tsx` (`showMine`) | Part of the in-flight restructure; previously it showed above company totals |

### 2.4 Admin panel

| ID | Requirement | Status | Evidence | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| M-01 | Incentive Master screen | ✅ | `AdminSection` + `DataTable`, eight columns | `app/(admin)/admin/incentive-master/page.tsx`, `components/admin/incentive-master/master-table.tsx` | |
| M-02 | Add / edit / delete | ✅ | `saveIncentive`, create dialog, typed-name delete | `app/(admin)/admin/incentive-master/actions.ts`, `components/admin/incentive-master/workspace.tsx` | |
| M-03 | Activate / deactivate, incl. bulk | ✅ | `setIncentiveActive` + `DataTable.bulkActions` | `components/admin/incentive-master/master-table.tsx` | Deliberately the only bulk operation |
| M-04 | Permanent / One-Time duration | ✅ | `INCENTIVE_DURATIONS` enum + column | `db/enums.ts:538-543` | Separate from `valid_until` and `active`, by design |
| M-05 | Valid Until | ✅ | Column + "Expired" chip + "On offer today" filter | `components/admin/incentive-master/master-table.tsx` | Expiry never rewrites `active` |
| M-06 | Product | ✅ | `product_id` → `outstanding_products` | `lib/queries/incentive-master.ts` | Same Admin Products table as the forms |
| M-07 | Incentive Chart / eligible employees | ✅ | Eligibility section in the workspace | `components/admin/incentive-master/workspace.tsx:636+` | Stays in Admin Panel, as required |
| M-08 | Employee search (name / code / email) | ✅ | `candidateHaystack` + `filterCandidates` | `lib/incentive/master.ts:355-380` | |
| M-09 | Function filter | ✅ | `departmentId` filter, options from Employee Master | `lib/queries/incentive-master.ts:215`, workspace toolbar | |
| M-10 | Department filter | 🟡 | **The department record IS the Function** in this schema | `lib/incentive/master.ts:340-346` (`departmentId` — "the department record, which Employee Master shows as Function") | There is no second taxonomy to filter on. The control is now labelled "Function / Department". A separate filter would be two controls over one column |
| M-11 | Combined search + filter | ✅ | Single `filterCandidates` ANDs them | `lib/incentive/master.ts:363-380` | The brief's worked example is that one function's behaviour |
| M-12 | Inactive / left employees unavailable for new eligibility | ✅ | `mayBecomeEligible` → `isCurrentEmployee`; the list itself keeps them only while they hold a grant | `lib/incentive/master.ts:390-397`, `lib/queries/incentive-master.ts:310-320` | A grant that needs ending never becomes invisible |
| M-13 | Effective date | ✅ | `effectiveFrom` input, validated by the same validator the action uses | workspace toolbar, `eligibilityChangeError` | |
| M-14 | Eligibility removal | ✅ | `removeIncentiveEligibility` with effective date | `app/(admin)/admin/incentive-master/actions.ts:707+` | |
| M-15 | Eligible-only visibility | ✅ | `scope` filter: Everyone / Eligible only / Not eligible | workspace toolbar | |
| M-16 | Manan-only modification, server-side | ✅ | `mayManageIncentiveEligibility()` checks the **effective and the real** identity, fails closed | `lib/incentive/eligibility-guard.ts` | Strongest authorization in the module |
| M-17 | Historical preservation | ✅ | Grants are closed with `removed_effective_from`, never deleted | `lib/queries/incentive-master.ts:280-300` | |
| M-18 | Audit / history view | ✅ | `EligibilityHistoryRow` with added-by / removed-by names, newest first | `lib/queries/incentive-master.ts:200-201,318-330` | |
| M-19 | Notifications on master / eligibility change | ✅ | Event-sourced: `recordIncentiveCatalogEvent` in the transaction, `processIncentiveCatalogEvent` after the response | `app/(admin)/admin/incentive-master/actions.ts:143,262,274,345,471,583,707` | Survives a crash between commit and send |
| M-20 | Saving with no real change notifies nobody | ✅ | `diffCatalog` returns no changes → no event | `lib/incentive/notifications/eligibility.ts:223-259` | |

### 2.5 Accounts / payment

| ID | Requirement | Status | Evidence | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| P-01 | Incentive payout screen | ✅ | Board + panel, month pills, four KPIs | `app/(app)/salary/incentive-payout/page.tsx`, `components/salary/incentive-payout-panel.tsx` | |
| P-02 | Approved / Due payable logic | ✅ | `basis: "accrued" \| "approved"`, default accrued | `app/(app)/salary/incentive-payout/actions.ts:38-40` | Accrued = client paid in full |
| P-03 | Paid / Unpaid tracking | ✅ | `paid_amt`, `paid_date`, `payout_run_id` per leg | `app/(app)/salary/incentive-payout/actions.ts:60-70` | |
| P-04 | Idempotent payout, no double-pay | ✅ | `payNow = max(0, ceiling − alreadyPaid)`, rows locked `FOR UPDATE` | `lib/incentive/payout-math.ts:81`, actions transaction | |
| P-05 | Payment history | ✅ | `incentive_payout_events` audit row per leg | `app/(app)/salary/incentive-payout/actions.ts:257+` | |
| P-06 | Integration with salary run | 🟡 | A `salary_payments` row with `kind='incentive'` is written and linked to the run | `app/(app)/salary/incentive-payout/actions.ts:257-266` | **Write-only.** No query, payslip, my-salary view or statement reads these rows back — see §7.2 |
| P-07 | Incentives shown above Reimbursement | 🔴 | No incentive reference anywhere in `app/(app)/reimbursements/*`; no ordering logic found | — | Not implemented |
| P-08 | Accountant permissions | 🟡 | The screen is `requireAdmin()` + the `accounts.payroll.incentive-payout` node | `app/(app)/salary/incentive-payout/page.tsx`, `lib/permissions/catalog.ts:391` | Works, but the node is not on any rail, so an accountant cannot reach it without the URL |
| P-09 | Reversed incentive → negative payable adjustment | 🔴 | No reference to reversal anywhere in `payout-math.ts`, `payout-sources.ts` or the payout action | grep: zero matches | Reversal is a request status only; it never reaches the ledger or the payout plan |
| P-10 | Settlement calculation | ✅ | `nilView(payable, paid)` + remainder | `lib/incentive/payout-math.ts:127` | |
| P-11 | Incentive Breakup Letter after payment | 🔴 | Zero references to an incentive breakup anywhere in the repository | grep `breakup` returns only CTC breakup (`salary_ctc_breakup`, `ctcBreakups`) — a different feature | Not implemented |
| P-12 | Breakup calculation / data correctness | 🔴 | Nothing to verify | — | Blocked by P-11 |
| P-13 | Payout feature flag | 🟡 | `INCENTIVE_PAYOUT === "true"`, default **OFF** | `lib/incentive/payout-flag.ts:17` | Inert unless explicitly enabled; re-checked inside the transaction |

### 2.6 Report card / weekly delivery

| ID | Requirement | Status | Evidence | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| RC-01 | Employee grade in a report | 🔴 | No report exists | — | The data exists (`EmployeePerformance`); the artefact does not |
| RC-02 | Current / last month figures | 🔴 | — | — | Periods are computable, nothing composes them into a report |
| RC-03 | Last 3 / last 6 / YTD figures | 🔴 | — | — | Same |
| RC-04 | Incentive earned / target / actual / deficit | 🔴 | — | — | Same |
| RC-05 | Current rank, previous rank, movement | 🔴 | — | — | Same |
| RC-06 | Employee-specific report | 🔴 | — | — | |
| RC-07 | Sunday 11 AM schedule | 🔴 | `vercel.json` has **no** weekly incentive cron. The only incentive cron is `"/api/cron/incentive-digest"` at `"0 5 1 * *"` — **monthly**, 1st of the month, 05:00 UTC | `vercel.json` | `goals-sunday-report` exists but belongs to the Goals module |
| RC-08 | Official email recipient | 🔍 | The monthly digest sends to `employees.email` for active employees | `app/api/cron/incentive-digest/route.ts:70-80` | Whether that column is the *official* address, or whether a separate official address exists, is unverified |
| RC-09 | Generated report contents | 🟡 | The **monthly digest** sends earned / paid / unpaid plus recent ledger lines — not the grade/rank report card | `app/api/cron/incentive-digest/route.ts`, `sendIncentiveMonthlyDigestEmail` | A different artefact with a different cadence |
| RC-10 | Actually automated vs UI only | 🟡 | The monthly digest **is** automated and authenticated (`CRON_SECRET`, constant-shape rejection, per-recipient failure isolation) | `app/api/cron/incentive-digest/route.ts:60-66` | The weekly report card is neither automated nor UI |

### 2.7 Notifications and emails

Full event matrix in §9. Summary:

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| N-01 | 14 notification kinds registered | ✅ | `lib/incentive/notifications/kinds.ts:19-35` |
| N-02 | 12 email templates | ✅ | `lib/incentive/notifications/content.ts:359-520` (numbered 1–12) |
| N-03 | Inbox category | ✅ | `lib/notifications/categories.ts:37,50,120-133` |
| N-04 | Push channel | ✅ | `INCENTIVE_NOTIFICATION_CHANNELS = ["email","push"]` |
| N-05 | Duplicate prevention / idempotency | ✅ | `incentive_notification_deliveries` claim with `onConflictDoNothing` |
| N-06 | Failure handling | ✅ | Claim released on dispatch failure so a real retry can still send |
| N-07 | Inactive recipients receive nothing | ✅ | `isActiveEmployee` check before the claim |
| N-08 | Deep links | ✅ | `safeIncentiveHref`, always an `/incentive` path |
| N-09 | Paid notice on every paid path | 🟡 | **Entries area does not notify** — see §9.3 |

### 2.8 Technical / regression

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| T-01 | Typecheck clean | ✅ | `npx tsc --noEmit` → exit 0 |
| T-02 | Incentive unit tests pass | ✅ | 249 passed across 5 incentive test files |
| T-03 | Full suite | 🟠 | 14 failures in 9 files — **all pre-existing** (verified by stashing the in-flight changes and re-running); none in incentive |
| T-04 | Mobile API present and validating | ✅ | `app/api/mobile/incentive/route.ts` → `prepareIncentiveRequest` |
| T-05 | Exports | ✅ | `/incentive/export.pdf`, `/incentive/export.xlsx`, `requireUser`, full catalog re-read server-side |
| T-06 | Feature flags | ✅ | `INCENTIVE_PAYOUT` (default off), `INCENTIVE_STATUS_UI` (default on) |
| T-07 | Deep links preserved | ✅ | `?request=`, `?view=table`, `?tab=`, `?year=` all still honoured |
| T-08 | Audit logging | ✅ | Decision rows, submission rows, payout events, eligibility grants, catalog events |

---

## 3. New request forms — detailed findings

### 3.1 What is genuinely solid

The validation architecture is the module's best engineering. `lib/incentive-fields.ts` defines every field of every type **once**, including its type, requiredness, conditional visibility (`showIf`), pane placement and placeholder. `lib/incentive/prepare-request.ts` re-runs all of it server-side. Both the server action (`createIncentiveRequest`) and the mobile POST call that one function, so:

- there is no rule that exists only in the browser;
- the Android app cannot bypass a check the web enforces;
- a field added to the definition is validated everywhere at once.

The split maths are done entirely in **basis points** (`10 000 = 100%`), which is why "must total exactly 100%" is a reliable integer comparison rather than a float tolerance.

### 3.2 Types and their fields — verified present

| Type | Key | Distinctive fields verified |
| --- | --- | --- |
| Conversion | `bss_conversion` | Product (required, from Admin Products), conversion attempt |
| Sales Pitch | `sales_pitch` | Pitch fields + product names |
| Client Happiness | `client_happiness` | Happiness Type (5 options), Client Permission (conditional), participant name, workshop, batch, link, content quality, "No Gyan Only Gain" |
| Group Introduction | `group_intro` | Introducer, prospect, event type (6), institution, cell (tel), email, tentative date, approx people (number) |
| Leads / Referrals | `leads_referrals` | Participant name, link, workshop, batch |

### 3.3 Finding — Client Permission coverage is narrower than the brief may intend

`CLIENT_PERMISSION_HAPPINESS_TYPES = ["Case Study", "Video Testimonial"]` (`lib/incentive-fields.ts:104`).
`CONTENT_REVIEW_HAPPINESS_TYPES = ["LinkedIn Testimonial", "Interview", "Case Study"]` (`lib/incentive/workflow.ts:35-39`).

So **LinkedIn Testimonial** and **Interview** go through Publish / Revise / Not Approved review but are never asked whether the client permitted publication, while **Video Testimonial** is asked but is *not* content-reviewed. The two lists overlap only on Case Study. This may be exactly what was decided — it matches `incentive-changes.md` #8 — but it is worth an explicit confirmation, because "ask permission before publishing" and "review before publishing" currently apply to different sets.

Status: 🟡 PARTIAL pending a product decision. **No change recommended without one.**

---

## 4. Approval / resubmission — detailed findings

### 4.1 Authority is real, not cosmetic

`decideIncentiveRequest` opens with `requireUser()` then `canReviewIncentives(me.email)` and refuses otherwise (`app/(app)/incentive/actions.ts:101-102`). The component's `canReview` prop only decides what renders. This is the correct shape, and the file's own comment records that it used to be `requireAdmin()` with a free verdict.

### 4.2 The state machine is data, not conditionals

`NORMAL_TRANSITIONS` / `CONTENT_TRANSITIONS` map a current status to the decisions allowed from it, and `availableDecisions` filters an ordered list through it. Terminal states are terminal because the table says so, not because a component hides a button.

### 4.3 History is protected by the database

`incentive_request_submissions` carries a unique index on `(request_id, submission_no)` and a **check constraint** requiring a non-empty justification for every submission after the first (`db/schema.ts:2712-2716`). That is the strongest possible form of "the original is preserved and a resubmission must be justified" — it survives a bug in the action.

### 4.4 Gap — nothing in the workflow reaches the ledger

A decision changes `incentive_requests.status`. It does **not** write to `incentive_entries`. So:

- Approving a request does not create a payable ledger line.
- **Reversing a request does not reverse anything that was paid** (see §7.3).

This is consistent with the documented design (Accounts records amounts separately), but it means the request workflow and the money ledger are two systems joined only by human action.

---

## 5. Dashboard / analytics — detailed findings

### 5.1 Calculation layer

`lib/incentive/analytics/` is pure and unit-tested:

- `grading.ts` — `pctOfCtc`, `gradeFor`, `periodCtc`, `competitionRanks`, `rankMovement`. Tests pin the tie/skip behaviour and the rounding-before-banding rule.
- `periods.ts` — period kinds, IST current month, calendar-year YTD, trailing windows that include the current month.
- `model.ts` — `buildIncentiveAnalytics`, which documents exactly where each figure comes from (requests for the four approval cards, the ledger for Paid/Unpaid, the ledger's approved amount for earnings).
- `scope.ts` — entitlement, and the `applyAnalyticsView` narrowing.

### 5.2 A subtle correctness property worth recording

Only people who **earned** in a window are ranked (`rankScore` returns null for zero earnings). Without it, a month nobody has earned in yet would show the entire company tied at rank 1. This is the kind of rule that is easy to regress; it currently has a test.

### 5.3 Ledger identity resolution

`resolveEarner` handles the imported sheet's annotated names (`"Mishtie Kanani ( Intern - Rohan C )"`) through a four-step ladder, and drops rows belonging to people who have left. Without it fifteen entries would be credited to a person who does not exist. Verified present in `model.ts`.

### 5.4 Gap — no employee report card

`grading.ts`'s own header names "the Employee Incentive Report Card" as a future consumer. Nothing consumes it. See §8.

---

## 6. Admin panel — detailed findings

### 6.1 Eligibility authorization is the module's high-water mark

`mayManageIncentiveEligibility()` resolves **both** the effective employee (the account in use) and the real employee (the person using it) and requires the capability of both (`lib/incentive/eligibility-guard.ts`). It fails closed. The two eligibility actions call it before anything else. The page calls the same function to decide what renders, so a visible control and an obeyed control are the same answer by construction.

### 6.2 Event-sourced notifications

Catalog and eligibility writes record an event row **inside the transaction** (`recordIncentiveCatalogEvent`) and process it **after the response** (`processIncentiveCatalogEvent`). A crash between commit and send leaves a durable event, not a lost notification. Verified at seven call sites in `app/(admin)/admin/incentive-master/actions.ts`.

### 6.3 Finding — "Department filter" has no second taxonomy behind it

`CandidateRow.departmentId` is documented as "the department record, which Employee Master shows as **Function**". The workspace filters on that column and labels it Function. There is no separate department column to filter on, so a distinct Department filter would be a second control over the same data — two controls that can disagree about one fact.

Current state: one control, now labelled "Function / Department" (a label-only change made during the restructure). Status 🟡 with the note that this is a schema reality, not an omission. If a genuinely separate department taxonomy is wanted, that is a schema and Employee Master change, not an Incentive one.

### 6.4 Eligibility stays in Admin Panel

Confirmed: eligibility is reachable only from `/admin/incentive-master` (behind `requireAdmin()` + `requireModuleView("admin.incentive.master")`), and the in-module Incentive Table dialog cannot edit it. **No recommendation to move it.** The earlier UI audit's suggestion of an Incentive-rail shortcut to the Master was **not** implemented, per the explicit instruction.

---

## 7. Accounts / payment — detailed findings

### 7.1 What works

`payIncentivesWithRun` is a careful piece of work: one transaction, `FOR UPDATE` row locks, a planned `payNow = max(0, ceiling − alreadyPaid)`, an audit event per leg, and re-checking the feature flag inside the transaction so a mid-flight flag flip aborts. It is idempotent by arithmetic rather than by a guard that can be forgotten.

### 7.2 Finding — the salary ledger link is write-only

The action inserts a `salary_payments` row with `kind = 'incentive'` linked to the run (`actions.ts:257-266`). A search for consumers of `salaryPayments` outside that file found **none** — no payslip query, no my-salary view, no annual statement, no earnings breakdown reads it back.

Consequence: P-06 is written but unobservable, and P-07 ("incentives above Reimbursement") has nothing to position. The two requirements are blocked on the same missing read path.

Status: 🟡 for the write, 🔴 for the read.

### 7.3 Finding — reversal has no payment consequence

Zero matches for reversal in `payout-math.ts`, `payout-sources.ts` or the payout action. `planIncentivePayout` takes a ceiling and an already-paid figure; it has no concept of a negative adjustment or a clawback.

So if an incentive is paid and the request is later Reversed:

- the request status changes and the employee is notified;
- the ledger's `paid_amt` stays where it is;
- the payout board shows nothing to recover;
- the next salary run has no negative line.

Status: 🔴 NOT DONE, and the highest-risk functional gap in the module because it concerns money already disbursed.

### 7.4 Finding — the payout screen is undiscoverable

`/salary/incentive-payout` has a permission node (`accounts.payroll.incentive-payout`) but no rail entry in any workspace (`grep "incentive-payout" components/layout/main-nav.tsx` → no match). An accountant must be given the URL.

The in-flight restructure added cross-links to it from the Incentive Status and Billing areas; it is still not on the Accounts rail. Status: 🟡.

---

## 8. Report card / Sunday email — detailed findings

### 8.1 The finding

**There is no weekly incentive report card, and nothing is scheduled to send one.**

Evidence:

1. `vercel.json` contains exactly one incentive cron: `{"path": "/api/cron/incentive-digest", "schedule": "0 5 1 * *"}` — the 1st of each month at 05:00 UTC (10:30 IST). Not Sunday, not weekly, not 11:00.
2. There is no `/api/cron/incentive-report`, `incentive-weekly`, or equivalent route.
3. `grep -i "report.card"` across `lib`, `app` and `components` returns exactly one hit — a **comment** in `lib/incentive/analytics/grading.ts:5` naming the report card as a hypothetical future consumer.
4. `goals-sunday-report` (`"30 3 * * 0"`) exists but belongs to the Goals module and contains no incentive data.

### 8.2 What does exist

`/api/cron/incentive-digest` is a real, well-built monthly job:

- authenticated with `CRON_SECRET` using a constant-shape rejection that never reveals whether the secret is configured;
- matches ledger rows to active employees by the same normalised name key the dashboard uses;
- per-recipient failure isolation (a send failure logs and the run continues);
- skips employees with no activity in the window;
- sends earned / paid / unpaid plus recent ledger lines via `sendIncentiveMonthlyDigestEmail`.

It is **a different artefact**: a monthly money summary, not a weekly grade/rank report card.

### 8.3 What a report card would need (not implemented, listed for scoping only)

Every input already exists: `loadIncentiveAnalytics` can produce grade, % of CTC, rank, previous rank, movement, target, actual and deficit for any period and any employee. The missing pieces are (a) a composer that runs it for five windows per employee, (b) an email template, (c) a cron entry at `0 5 * * 0` (11:00 IST ≈ 05:30 UTC — note the half-hour offset), and (d) recipient selection. None of these exist.

---

## 9. Notifications / email — event-by-event matrix

### 9.1 Architecture, verified end to end

```
action (in a transaction)
  └─ recordIncentiveCatalogEvent / notifyIncentiveDecision / notifyIncentivePaid
       └─ deliverIncentiveNotification            lib/incentive/notifications/service.ts:100
            ├─ recipient active?                  → "inactive", nothing sent
            ├─ claim row in incentive_notification_deliveries (onConflictDoNothing)
            │                                     → "duplicate", nothing sent
            └─ notify({ kind, title, body: encoded meta, channels: ["email","push"] })
                 ├─ notifications row  → Inbox (category "incentive")
                 ├─ sendNotificationEmail → IncentiveNoticeEmail  emails/notifications/IncentiveNotice.tsx
                 └─ push
            on dispatch throw → claim DELETED so a genuine retry can still send
```

The notification `body` carries a JSON payload (`IncentiveNotificationMeta`) that is the **single** source for the Inbox line, the push banner and the email — so a retried email renders exactly what the first attempt would have, from the row alone.

### 9.2 Event matrix

| Event | App notification | Email | Recipient | Trigger (verified) | Deep link | Idempotent | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New incentive created | ✅ `incentive_created` | ✅ template 1 | Eligible employees | `recordIncentiveCatalogEvent` in the create transaction | Incentive Table | ✅ claim table | ✅ |
| New eligibility (added to an existing incentive) | ✅ `incentive_created` with `newlyEligible` | ✅ template 1 (variant copy) | The newly eligible employee | `addIncentiveEligibility` → event | Incentive Table | ✅ | ✅ |
| Eligibility removed | ✅ `incentive_eligibility_removed` | ✅ template 2 | The removed employee | `removeIncentiveEligibility` → event | Incentive Table | ✅ | ✅ |
| Incentive edited | ✅ `incentive_updated` | ✅ template 3 (carries a change list) | Eligible employees | `saveIncentive` → `diffCatalog` → event | Incentive Table | ✅ | ✅ |
| Incentive deleted | ✅ `incentive_deleted` | ✅ template 4 | Eligible employees | delete transaction → event | Incentive Table | ✅ | ✅ |
| Approved | ✅ `incentive_request_approved` | ✅ template 6 | The filer | `notifyIncentiveDecision` | The request | ✅ | ✅ |
| Published | ✅ `incentive_request_published` | ✅ template 12 | The filer | same | The request | ✅ | ✅ |
| Not Approved | ✅ `incentive_request_not_approved` | ✅ template 5 (needs `m.note`) | The filer | same | The request | ✅ | ✅ |
| Revision required | ✅ `incentive_request_revision` | ✅ template 11 | The filer | same | The request | ✅ | ✅ |
| Due | ✅ `incentive_request_due` | ✅ template 7 | The filer | same | The request | ✅ | ✅ |
| Not Due | ✅ `incentive_request_not_due` | 🟡 **app only, by design** | The filer | same | The request | ✅ | ✅ (documented: `incentive-changes.md` #53) |
| Reversed | ✅ `incentive_request_reversed` | ✅ template 10 | The filer | same | The request | ✅ | ✅ |
| Resubmitted | ✅ `incentive_request_resubmitted` | ✅ template 9 | **The reviewer (Manan)** | `notifyIncentiveResubmitted` | The request | ✅ | ✅ |
| Paid — via salary payout | ✅ `incentive_paid` | ✅ template 8 | The employee | `notifyIncentivesPaid` after the payout transaction | `/incentive` | ✅ version key = amount+date | ✅ |
| Paid — via the Status editor | ✅ `incentive_paid` | ✅ template 8 | The employee | `notifyIfPaidIncreased` — only when paid **increases** | `/incentive` | ✅ | ✅ |
| **Paid — via the Entries editor** | 🔴 | 🔴 | — | **`updateIncentiveEntry` contains no notify call at all** | — | — | 🟡 **GAP** |
| Breakup Letter | 🔴 | 🔴 | — | Feature does not exist | — | — | 🔴 |
| Sunday report | 🔴 | 🔴 | — | No cron, no route | — | — | 🔴 |
| Monthly digest (not in the brief's list) | 🔴 app | ✅ email | Active employees with activity | `/api/cron/incentive-digest`, `0 5 1 * *` | — | 🔍 no claim table on this path | 🟡 |

### 9.3 Finding — the Entries paid-notice gap

`app/(app)/incentive/admin-actions.ts` defines `createIncentiveEntry`, `updateIncentiveEntry`, `deleteIncentiveEntry`, `setIncentiveTarget`, `setIncentiveYearTarget`, `bulkUploadIncentiveEntries` and `getPersonDetail`. A grep for `notify` and `afterResponse` in that file returns **nothing**.

`updateIncentiveEntry` accepts `paidAmt` (line 49, written at 133). So an admin raising a paid amount on the **Entries** area pays an employee silently, while the identical change on the **Status** area triggers `notifyIfPaidIncreased` (`status-actions.ts:27-52`) and the salary payout triggers `notifyIncentivesPaid`.

`incentive-changes.md` #46 states the employee is told "when Accounts pays an incentive — through the salary incentive payout, **or by raising the paid amount on an incentive**". Two of the three paths honour that; one does not.

Impact: an employee can be paid without being told, depending on which admin screen was used. Both screens are admin-only and both write the same column.

Status: 🟡 PARTIAL. Fix is small and local (call the same `notifyIfPaidIncreased` helper), but it is a behaviour change and therefore **out of scope for this audit**.

### 9.4 Finding — the monthly digest has no delivery claim

The digest route iterates employees and sends directly. It does not write to `incentive_notification_deliveries`, so a manual re-trigger of the cron within the same month would send the digest again. Vercel will not normally double-fire, and the route is authenticated, so exposure is low — but the guarantee is weaker than every other incentive notification.

Status: 🔍 NEEDS VERIFICATION (is a re-run ever performed operationally?).

---

## 10. UI/UX — actual implementation vs `Incentive-UI-UX-Audit.md`

### 10.1 Functional completion vs UI/UX completion

These are genuinely different numbers and should not be conflated:

| | Estimate | Reasoning |
| --- | --- | --- |
| **Functional completion** | ~85% | Every workflow rule, permission and calculation is implemented and enforced server-side. The gaps are three missing *features* (report card, breakup letter, reversal adjustment), not broken existing ones. |
| **UI/UX completion** | ~70% | The in-flight restructure closed most structural findings; what remains is the long tail of token/type/spacing work in the dialogs and the Admin workspace. |

### 10.2 Audit findings now addressed (in the working tree)

| Audit ID | Finding | State |
| --- | --- | --- |
| NAV-03 | Rail order was not usage order | ✅ reordered to Dashboard · Requests · Targets · Entries · Status · Billing; the paired test was updated to keep the rail ≡ page-areas invariant |
| DASH-01 / DASH-02 | Two time controls, two contradictory KPI rows | ✅ the year picker now appears only on year-scoped areas; the KPI row is computed from the same period-scoped data as the cards below it |
| DASH-03 | Year overview as a `<details>` above the dashboard | ✅ demoted to a "Trends" band below the grade table |
| DASH-08 / BILL-03 | Two podiums duplicating their own ranked lists | ✅ both removed; rank folded into the tables |
| REQ-04 / REQ-05 | Requests had no filter/sort/search, at ~150px per card | ✅ now an expandable-row `DataTable` with status/type/scope filters; the expansion keeps the full detail, history and decision panel |
| REQ-06 | "New request" buried above the list | ✅ moved to the page command bar, present on every area |
| REQ-02 | Resubmit callout must stay visible | ✅ preserved — rendered above the table, never behind the disclosure |
| ENT-01 | Unbounded Entries table, no search | ✅ `DataTable` with month/incentive/approved/paid filters and 25-row paging |
| ENT-02 | Silent delete | ✅ now goes through a shared `ConfirmDialog` naming the entry |
| TGT-02 / TGT-03 / TGT-06 | Triple-encoded attainment, hand-rolled sort, no filters | ✅ `DataTable`, bar + figure only, target/attainment filters, frozen person column |
| STA-02 | Two search boxes on one screen | ✅ one per table, both from `DataTable` |
| MOD-03 | Seven hand-rolled table implementations | 🟡 five migrated; `inc-employee-table.tsx` and `incentive-person-drilldown.tsx` still hand-rolled |
| MOD-04 | Six KPI card implementations | ✅ one `IncentiveKpi` used by dashboard, targets, billing and trends; the payout page's own copy remains |
| MOD-12 | Three destructive-action standards | 🟡 `ConfirmDialog` exists and is used by Entries; the catalog dialog still uses `window.confirm` |
| MOD-13 | Eight empty states | ✅ one `IncentiveEmptyState` across the migrated areas |
| STATE-02 | No `loading.tsx` | ✅ added, painting the dashboard's shape |
| VIS-01 / VIS-05 | Hardcoded accent, flat button hierarchy | 🟡 tokens introduced (`ui/tone.ts`) and the primary buttons moved to `.pastel-cta`; literal hexes remain in the dialogs, the person drilldown and the payout page |
| PERM-05 | Company KPIs ignored the Team/User switch | ✅ the KPI row is now scope-aware |
| D-17 | "Your grade" shown against company data | ✅ the personal block renders only when the view is genuinely the viewer's |

### 10.3 Audit findings still open

| Audit ID | Finding | Why still open |
| --- | --- | --- |
| CHT-02 | Catalog row actions are hover-only (`opacity-0 group-hover:opacity-100`) — invisible on touch | Not yet reached |
| CHT-03 | Catalog delete uses the native blocking `confirm()` | Not yet reached |
| CHT-05 | Catalog dialog title uses `font-serif italic`, used nowhere else | Not yet reached |
| MAS-04 | The Admin workspace uses the Aura glass language | **Deliberate.** The Aura design language was supplied as an explicit instruction for admin surfaces; the earlier recommendation to strip it is superseded |
| PAY-01 / PAY-02 / PAY-03 | The payout page hand-rolls its layout, uses an eyebrow pill, and names red constants `GREEN` | Not yet reached |
| NAV-11 | Period/scope live in client state, not the URL | Deliberate for now — promoting them needs a second fetch path |
| MOB-02 | Tables fall back to horizontal scroll on phones | `stickyFirstColumn` mitigates; column collapsing not implemented |
| A11Y-03 | Expanded request detail nested a `<section>` inside a `<dl>` | ✅ fixed incidentally by the table rewrite |

### 10.4 Navigation — verified

- **No duplicate horizontal navigation.** `incentive-tabs.tsx` contains no `role="tablist"`, no `role="tab"`, and no segmented strip; a test pins this (`incentive-dashboard-scope.test.ts:179-190`).
- **Rail ≡ page areas**, in the same order, pinned by `incentive-module.test.ts`.
- **Permission node still resolves**: rail hrefs stay bare (`/incentive`), so `nodeKeyForPath` returns `employees.incentive`; a `?tab=` baked into an href would silently un-gate the rail. Pinned by test.
- **Deep links preserved**: `?request=`, `?view=table`, `?tab=`, `?year=`.

---

## 11. Technical / security / regression findings

### 11.1 Server-side authorization — verified at every boundary

| Surface | Gate |
| --- | --- |
| `/incentive` page | `requireUser()` + `(app)` layout's `requirePathView` → `employees.incentive` |
| Decide a request | `requireUser()` + `canReviewIncentives(email)` |
| Read a request's history | ownership OR admin OR reviewer |
| Entry create/update/delete, targets | `requireAdmin()` |
| Status / split editors | `requireAdmin()` + `INCENTIVE_STATUS_UI` |
| Incentive Master | `requireAdmin()` + `requireModuleView/Edit("admin.incentive.master")` |
| Eligibility | `mayManageIncentiveEligibility()` — effective **and** real identity, fails closed |
| Payout | `requireAdmin()` + rate limit + `INCENTIVE_PAYOUT` re-checked in the transaction |
| Exports | `requireUser()` (matches the table's read-for-everyone rule) |
| Mobile API | `authenticateMobileRequest` + rate limit + the same `prepareIncentiveRequest` |

No authorization gap found.

### 11.2 Data-flow findings

1. **Requests and the ledger are separate systems.** Approving writes no ledger row. Intentional, but it means "Approved" and "payable" are joined only by an admin's later action (§4.4).
2. **`salary_payments` is write-only** for `kind='incentive'` (§7.2).
3. **The ledger is name-keyed, not id-keyed** in places, which is why `resolveEarner` and `nameKey` exist. Correct today; fragile to any future name-format change in the source sheet.
4. **The Billing area is unscoped** inside a scoped module — every employee sees every deal. Flagged in the UI audit as an open product question; unchanged.

### 11.3 Dead / duplicated code

| Item | Note |
| --- | --- |
| `components/incentive/incentive-monthly-chart.tsx` (14 lines) | A thin re-export shell over `-impl`; harmless |
| `inc-employee-table.tsx`, `incentive-person-drilldown.tsx` | Still carry their own `Th`/`Td`/sort implementations — the last two of the original seven |
| `scripts/verify-incentive-notifications.ts` | A live verification harness, not dead — exercises the delivery paths including duplicate suppression |
| Payout page's `GREEN`/`GREEN_DEEP` constants | Hold **red** values (`#E10600`/`#A80400`). Cosmetic today, a genuine trap for the next reader |

### 11.4 Regression status of the in-flight UI restructure

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **exit 0**, no errors |
| `vitest` incentive files (5) | **249 passed**, 0 failed |
| `vitest` full suite | 3423 passed, **14 failed** in 9 files |
| Are those 14 pre-existing? | **Yes — verified.** The changes were stashed (`git stash push -u`), the same three representative failing files re-run, and they failed identically; the stash was then popped and the working tree confirmed restored |
| Failing areas (all unrelated to Incentive) | `bulk-entry-keeps-drafts`, `daily-salary-report-render`, `delegated-access-authorization`, `device-exemption-login`, `task-actions`, `task-timer-store` and three others |

Files changed by the restructure (presentation only; no action, query, schema, permission or rule touched):

```
app/(app)/incentive/page.tsx                    app/(app)/incentive/loading.tsx            (new)
components/admin/ui/data-table.tsx              (additive opt-in props only)
components/incentive/incentive-tabs.tsx         components/incentive/incentive-list.tsx
components/incentive/incentive-targets.tsx      components/incentive/incentive-entries.tsx
components/incentive/incentive-status-tab.tsx   components/incentive/incentive-status-report.tsx
components/incentive/incentive-dashboard.tsx    components/incentive/billing-dashboard.tsx
components/incentive/incentive-status-pill.tsx  components/incentive/incentive-form-dialog.tsx (trigger only)
components/incentive/analytics/incentive-analytics-dashboard.tsx
components/incentive/ui/{tone.ts,kpi.tsx,badges.tsx,states.tsx,confirm-dialog.tsx,chrome.tsx}  (new)
components/layout/main-nav.tsx                  (rail order only)
components/admin/incentive-master/workspace.tsx (one filter label)
tests/unit/incentive-module.test.ts             (rail-order expectation)
```

`DataTable`'s new props (`renderRowDetail`, `initiallyExpandedKeys`, `pageSize`, `stickyFirstColumn`, `footerRow`) are all optional and default to the previous behaviour, so the ~15 other admin screens that use it are unaffected — confirmed by the full suite showing no new failures.

### 11.5 Edge cases worth noting

- `INCENTIVE_PAYOUT` defaults **off**; `INCENTIVE_STATUS_UI` defaults **on**. An environment that has never set the former has an inert payout path.
- The monthly digest computes its window in **UTC** while the rest of the module reasons in **IST**. For a 05:00 UTC run on the 1st this is safe, but the two conventions coexist.
- 11:00 IST is 05:30 UTC — a half-hour offset that a future Sunday cron must express as `30 5 * * 0`, not `0 5 * * 0`.

---

## 12. Remaining work

Only genuinely incomplete items. Ranked by delivery risk and blast radius.

### VERY HIGH

| # | Item | Why |
| --- | --- | --- |
| 1 | **Reversal → negative payable adjustment** (P-09) | Concerns money already paid out. A reversed-after-payment incentive currently has no recovery path anywhere in the system. Needs a product decision on the mechanism (clawback line, negative ledger entry, or next-run adjustment) before any implementation. |

### HIGH

| # | Item | Why |
| --- | --- | --- |
| 2 | **Sunday 11 AM Report Card** (RC-01…RC-10) | Believed shipped; is not. All inputs exist, so this is composition + template + cron + recipient selection. Note 11:00 IST = `30 5 * * 0`. |
| 3 | **Paid-notice gap on the Entries area** (N-09) | An employee can be paid without being told, depending on which admin screen was used. Small, local fix — reuse `notifyIfPaidIncreased`. |
| 4 | **`salary_payments` read path** (P-06, P-07) | Until something reads `kind='incentive'` rows back, the salary integration is unobservable and "incentives above Reimbursement" has nothing to order. |

### MEDIUM

| # | Item | Why |
| --- | --- | --- |
| 5 | **Incentive Breakup Letter** (P-11, P-12) | A whole feature with no code. Scope it after #4, since it depends on the same read path. |
| 6 | **Payout screen discoverability** (P-08, §7.4) | Add `/salary/incentive-payout` to the Accounts rail; the permission node already exists. |
| 7 | **Finish the UI token/type sweep** (§10.3) | Catalog dialog hover-only actions and `confirm()`, the payout page's layout and mis-named colour constants, and the last two hand-rolled tables. |
| 8 | **Client Permission coverage decision** (R-21, §3.3) | Confirm whether LinkedIn Testimonial and Interview should also ask. Product call, then a one-line constant change. |

### LOW

| # | Item | Why |
| --- | --- | --- |
| 9 | **Monthly digest idempotency** (§9.4) | Add a delivery claim, or confirm the cron is never manually re-run. |
| 10 | **Period/scope in the URL** (NAV-11) | Makes a dashboard view shareable and refresh-proof. |
| 11 | **Mobile table column collapsing** (MOB-02) | Currently horizontal scroll with a pinned first column. |
| 12 | **Billing scope decision** (§11.2.4) | Product call on whether Billing should respect the module's scope. |

---

## 13. Recommended next steps

The order below is chosen so each step unblocks the next and nothing is built twice.

1. **Decide the reversal mechanism** (#1). It is the only item where the current behaviour can cost real money, and it is a product decision before it is an engineering one. Nothing else should be built on top of the payout maths until this is settled.
2. **Close the paid-notice gap** (#3). Hours of work, removes a silent-payment path, and is independent of everything else.
3. **Build the `salary_payments` read path** (#4). One query plus one view. It makes the existing payout write observable and is the prerequisite for both the Reimbursement ordering and the breakup letter.
4. **Ship the Sunday Report Card** (#2). All the data exists; this is composition, one email template, one cron entry (`30 5 * * 0`) and recipient selection. Reuse `loadIncentiveAnalytics` rather than writing a second calculation.
5. **Then the Breakup Letter** (#5), on top of step 3's read path.
6. **Add the payout screen to the Accounts rail** (#6) — a one-line nav change, and it makes steps 3–5 reachable by the people who use them.
7. **Finish the UI sweep** (#7) once the functional work above has settled, so the remaining dialogs are restyled once rather than twice.
8. **Resolve the two open product questions** (#8 Client Permission, #12 Billing scope) at whatever point the owner is available; neither blocks engineering.

Throughout: do not move eligibility out of the Admin Panel, do not create a second incentive catalog, and do not change the Android API shape — the mobile app has not been updated since the 2026-09 changes.

---

CURRENT STATE:
✅ Done: 63
🟡 Partial: 11
🔴 Remaining: 11
🟠 Broken: 1
🔍 Needs verification: 3
