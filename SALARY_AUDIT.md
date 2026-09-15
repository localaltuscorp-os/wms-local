# How Salary Is Actually Calculated — Complete Audit

**Read-only teardown. No code changed.**

| | |
|---|---|
| Repo | `wms-local-main` |
| Branch head | `9963b8d` — **mid-merge, unresolved conflicts** |
| Database | Supabase `aws-0-ap-south-1` (read-only `SELECT`s only) |
| Audited | 10 Sep 2026 |

> Every figure in this document is either transcribed from the implementation or produced by
> running the repository's own pure functions over production data. No file was created,
> modified or deleted in the repo during the audit (this document aside); no database row was written.

---

## Table of contents

1. [Salary architecture](#01--salary-architecture)
2. [Complete database map](#02--complete-database-map)
3. [Every salary-related route and action](#03--every-salary-related-route-and-action)
4. [Services and functions](#04--services-and-functions)
5. [Exact formulas](#05--exact-formulas)
6. [Employee type logic](#06--employee-type-logic)
7. [Attendance → salary, day by day](#07--attendance--salary-day-by-day)
8. [Holiday logic](#08--holiday-logic)
9. [Leave logic](#09--leave-logic)
10. [Remote work logic](#10--remote-work-logic)
11. [Monthly calculation — actual execution order](#11--monthly-calculation--actual-execution-order)
12. [Daily earnings — does it exist?](#12--daily-earnings--does-it-exist)
13. [My Salary — the frontend](#13--my-salary--the-frontend)
14. [Duplicate and conflicting logic](#14--duplicate-and-conflicting-logic)
15. [Every hardcoded value](#15--every-hardcoded-value)
16. [One real employee, end to end](#16--one-real-employee-end-to-end)
17. [Defects and inconsistencies](#17--defects-and-inconsistencies)
18. [Source of truth, per quantity](#18--source-of-truth-per-quantity)

---

## 01 · Salary architecture

Pay is not stored as a decision. It is **re-derived from attendance punches every time anyone
looks**, then frozen into a row. Almost every anomaly in this system follows from that one fact.

There is exactly one money spine, and it is short. Everything else is plumbing that feeds it or
surfaces that read it.

```
   attendance_logs      employees        holidays      leave_requests    comp_off_credits
   raw in/out punches   schedule+type    3 calendars   approved only     earned/redeemed
          │                  │               │               │                  │
          └──────────────────┴───────────────┴───────────────┴──────────────────┘
                                      ↓
                    ┌──────────────────────────────────────────┐
                    │  computeDayCode → one code per day       │  PURE
                    │  P · H/D · A · W/O · H · HP · H-H/D      │
                    │  PL · LWP · CO                           │
                    └──────────────────────────────────────────┘
                                      ↓
        ┌──────────────────────────────────────────────────────────────┐
        │  reconcileMonth → weekly targets, signed carry, half-day     │  PURE
        │  grace. Ordinary days only · Mon-anchored weeks ·            │
        │  month-scoped balance                                         │
        └──────────────────────────────────────────────────────────────┘
                                      ↓
            ┌──────────────────────────────────────────────────┐
            │  payableHoursForMonth → target hrs + payable hrs  │  PURE
            │  min(actual, target) + credited · floor to hour   │
            └──────────────────────────────────────────────────┘
                                      ↓
                ┌──────────────────────────────────────────┐
                │  computeForRow → routes by pay basis      │  PURE
                │  monthly_ctc → schedule-hourly            │
                │  hourly · fixed_fee                       │
                └──────────────────────────────────────────┘
                                      ↓
        ┌───────────────────┬───────────────────────┬──────────────────────┐
        ↓                   ↓                       ↓
   salary_runs         salary_breakup          My Salary card
   canonical           Accounts page           reads runs +
   payslip PDF         mirror + overlays       re-grades days
```

The four boxed stages are pure, DB-free, unit-tested functions. The three outputs are written by
**two different writers at two different moments** — see §17.

### Three eras, three attendance sources

`assembleMonthInputs()` picks a different attendance source per month, and the boundaries are
string literals in the code:

| Month | Attendance source | Pay function | Behaviour |
|---|---|---|---|
| `≥ 2026-08` | `getMonthDashboard` — live punch grader | `computeScheduleHourlySalary` | Recomputed on every read of the open month |
| `= 2026-07` | `getMonthDashboardMerged` — locked HR sheet + graded joiners | `computeSalary` (day-based) | Transition month; `payroll` is absent, so the schedule engine never fires |
| `< 2026-07` | `getAttendanceSheetPayableMap` — frozen sheet mirror | `computeSalary` (day-based) | Historical; never re-derived |

> **⚠ Dead constant.** `SALARY_PUNCH_CUTOVER = "2026-07"` is exported from
> `lib/salary/generate.ts:36` and referenced only by a comment. The three branches above compare
> against the string literals `"2026-08"` and `"2026-07"` directly. Changing the constant changes
> nothing.

---

## 02 · Complete database map

Fourteen tables participate. Only three hold money; the rest decide how much of it is earned.

### Money tables

#### `salary_profiles`

- **PK** `id uuid` · **`employee_id` UNIQUE** (one profile per employee)
- **FK** `employee_id → employees.id` `ON DELETE CASCADE`
- **Fields that matter to pay:** `annual_ctc`, `tds_monthly`, `pt_exempt`, `pay_type`,
  `monthly_pay_at_target`, `weekly_target_hours`, `monthly_fee`
- **Written by:** `upsertSalaryProfile` (admin only)

#### `salary_runs` — the canonical payroll record

- **PK** `id uuid` · **UNIQUE `(employee_id, month)`** · indexes on `month`, `import_batch_id`
- **FK** `employee_id → employees.id` CASCADE; `approved_by_id`, `generated_by_id → employees.id` SET NULL
- **Fields:** `fy`, `month` (text `YYYY-MM`), `annual_ctc`, `days_in_month`, `payable_days`,
  `late_marks`, `late_deduction_days`, `gross`, `pt`, `tds`, `advances`, `pending_balance_in`,
  `net_payable`, `pay_type`, `worked_hours`, `hourly_rate`, `target_hours`, `overtime_hours`,
  `overtime_amount`, `disbursed`, `disbursed_amount`, `source`, `import_batch_id`
- **Written by:** `generateSalary`, `generateSalaryAll`, `refreshOpenMonthRun`, `confirmSalaryImport`,
  `setDisbursed`, `editRun`

#### `salary_breakup` — the Accounts register + human overlays

- **PK** `id uuid` · **UNIQUE `(employee_name, month)`** · indexes on `month`, `employee_id`
- `month` is a `date` column pinned to the 1st (`2026-08-01`), unlike `salary_runs.month` which is text
- **FK** `employee_id → employees.id` SET NULL (nullable — sheet rows may be unlinked)
- **Attendance columns:** `present`, `absent`, `half_day`, `weekly_off`, `holiday`, `poh_full`,
  `poh_half`, `days_in_month`, `total_days_worked`, `final_working_days`, `set_off`, `cf`
- **Money columns:** `annual_ctc`, `monthly_ctc`, `payable_after_leave`, `pt`, `payable_after_pt`,
  `advance`, `previous_pending`, `final_payment`, `salary_given`, `pay_type`, `worked_hours`
- **Human overlays (never touched by sync):** `paid`, `paid_at`, `paid_by_id`, **`amount_paid`**,
  `admin_note`, **`waive_off_days`** + note/at/by, **`payout_adjustment`** + note/at/by
- **Written by:** `syncBreakupFromApp`, `mirrorToBreakup`, the Google-Sheet sync,
  `writePayment`, `setWaiveOff`, `setPayoutAdjustment`, `setSalaryNote`

> **⚠ Uniqueness hazard.** `salary_breakup` is unique on **`(employee_name, month)`**, not
> `(employee_id, month)`. `syncBreakupFromApp` compensates by matching on employee id first, then
> on a whitespace-normalised lowercase name, and back-filling `employee_id`. A person whose name
> changes between syncs can still produce a second row; the reader (`listSalaryBreakup`)
> de-duplicates in JS by keeping the lowest `sr_no`.

#### `salary_advances`

- **PK** `id uuid` · index `(employee_id, month)`
- `advance_date`, `fy`, `month` (text `YYYY-MM`), `amount`, `note`, `created_by_id`
- Written by `addAdvance` / `deleteAdvance`

#### `salary_config`

- **PK** `id = 'default'` (singleton)
- `divisor_policy`, `fixed_divisor`, `free_training_days`, `default_pt`, `salary_day_of_month`,
  `joiner_leave_accrual`
- **Read by nothing on the live pay path** — see §15.

Live values: `actual` / `31` / `7` / `200.00` / `10` / `[3,4,3,4,3,4]`.

#### Also present but peripheral

`salary_policies` + `salary_policy_consents` (policy PDF versioning and e-signature),
`salary_payments` (written only by `incentive-payout/actions.ts`).

### Attendance & calendar tables

| Table | Key fields | Role in salary |
|---|---|---|
| **`employees`** | `id`, `worker_type`, `weekly_off` (0=Sun), `timezone`, `joined_at`, `probation_end`, `att_official_start`, `att_official_end`, `att_late_after`, `att_early_before`, `att_full_day_minutes`, `att_half_day_minutes`, `weekly_target_minutes`, `designation_id`, `paying_entity_id`, `is_active` | The schedule that sets target hours and every day-grade cutoff. `worker_type` is the single branch point for pay basis. |
| **`attendance_logs`** | `employee_id`, `log_date` (local date), `kind` (`'in'`\|`'out'`), `logged_at`, `source`, `reason`, `recorded_by_id`, `work_mode` | The only evidence of work. Folded to one in/out pair per local day. **No `created_at`** — punch edits are undateable. |
| **`holidays`** | `holiday_date` UNIQUE, `label`, `is_active` | Admin/HR calendar. An **inactive** row is a *suppression*: it cancels a date the other two calendars declare. |
| `event_holidays` | `holiday_date`, `is_office_closed`, `is_optional`, `is_festival_marker`, `is_exam_marker`, `applies_to` | Monthly Events Master. Counts only when office_closed ∧ ¬optional ∧ ¬festival_marker ∧ ¬exam_marker ∧ applies_to ∈ (all, custom). |
| *(code)* `HOLIDAYS_2026` | `lib/hr/holidays-2026.ts` | The firm's published 15-day calendar. Lives in TypeScript, not in any table. |
| **`leave_requests`** | `employee_id`, `kind` (`'paid'`\|`'unpaid'`), `category_id`, `start_date`, `end_date`, `start_half_day`, `end_half_day`, `days`, `status` | Only `status = 'approved'` reaches the grader. `kind` is the payroll branch; `category_id` never touches pay. |
| `leave_categories` | `name`, `sort_order`, `is_active` | Human reason only. Deliberately separate from `kind` so a form can never extend the payroll union. |
| `comp_off_credits` | `employee_id`, `earned_date`, `redeemed_date`, `status` | An `earned_date` in range **suppresses HP** → plain H/W-O. A `redeemed_date` grades that day `CO` (value 1, credited). |
| `remote_work_requests` | `employee_id`, `work_date`, `work_mode`, `status`, `client_location_id` | **Display only.** Attaches a badge to the calendar cell; never alters code, day value, worked minutes or pay. |
| `org_settings` | `att_late_after`, `att_early_before`, `att_full_day_hours`, `att_half_day_hours` | Lowest-precedence fallback in the schedule resolver. Live: `10:50` / `19:20` / `9` / `5`. |
| `attendance_sheet_month` | `employee_id`, `month`, `total_days_worked`, `days_in_month`, `present`, `absent` | Frozen HR-sheet mirror for months before 2026-07. |
| `attendance_month_freeze` | `month`, frozen flag | Read by `isMonthFrozen` in the finance analytics only. |
| `overtime_entries` | `employee_id`, `work_date`, `hours`, `status` | **Entirely disconnected from salary.** A standalone approval ledger; no pay code reads it. 0 rows in production. |

### Dependency chain, as actually implemented

```
employees.worker_type
   ├─ payBasisFor()      → monthly_ctc | hourly | fixed_fee
   └─ isHourlyShift()    → decides whether the WEEK or the DAY is primary
        │
employees schedule columns  +  org_settings
        └─ resolveEffectiveConfig()
             → dailyTargetMinutes, weeklyTargetMinutes,
               fullDayMinutes, halfDayMinutes, lateAfter, earlyBefore
        │
attendance_logs (folded per local day)
   +  holidays ∪ event_holidays ∪ HOLIDAYS_2026  −  inactive holidays
   +  leave_requests WHERE status='approved'
   +  comp_off_credits
        └─ computeDayCode() → { code, dayValue, workedMinutes, late, leftEarly }
        │
        ├─ payableDaysByHours()   → summary.payableDays    (display / legacy pay)
        └─ reconcileMonth()       → weekly targets, signed carry, half-day grace
             └─ payableHoursForMonth() → targetHours, payableMinutesRaw,
                                         unpaidLeaveDays, netSurplusMinutes
        │
salary_profiles + salary_advances + prior disbursed run
        └─ assembleMonthInputs() → MonthInputRow
             └─ computeForRow()  → SalaryBreakdown
        │
        ├─→ salary_runs        (canonical; payslip PDF)
        ├─→ salary_breakup     (Accounts page; carries the human overlays)
        └─→ My Salary card     (re-grades the days a second time)
```

---

## 03 · Every salary-related route and action

Next.js App Router. There is **no REST layer for salary writes** — every write is a server action.
Reads split between server components, route handlers that emit PDFs/CSVs, and one mobile JSON
endpoint.

### Server actions — writes

#### `generateSalary(month)` — `app/(app)/salary/actions.ts`

- **Auth:** `requireAdmin()` + `rateLimitOrError(me.id, "write")`
- **Params:** `{ month: "YYYY-MM" }` via `GenerateSalarySchema`
- **Reads:** `salary_profiles` (left-joined onto every active employee), attendance (era-dependent),
  `salary_advances`, the prior disbursed run
- **Writes:** `UPSERT salary_runs ON CONFLICT (employee_id, month)` — recomputed columns only.
  The `set` clause deliberately omits `disbursed`, `disbursed_amount`, `approved_by_id`.
- **Calls:** `assembleMonthInputs` → `computeForRow` → then `syncBreakupFromApp(month)`
- **Returns:** `{ ok: true, generated: n }`
- Employees with no pay config for their basis are **skipped** — no ₹0 run is materialised.

#### `generateSalaryAll(month)` — same file

- Same auth. **Skips anyone who already has a run** for the month, so it never clobbers an existing
  or hand-edited row. Best-effort per employee: a failure is counted, the loop continues.
- **Returns:** `{ created, skipped, failed, firstError? }`

#### `editRun(runId, { advances?, pendingBalanceIn? })`

- `requireAdmin`. Refused when the run is `disbursed`.
- Recomputes `net = gross − pt − tds − advances + pendingBalanceIn` from the *stored* gross/pt/tds.
- **Silently overwritten by the next `generateSalary`**, which re-derives both fields from source.

#### `setDisbursed(runId, disbursed, disbursedAmount?)`

- `requireAdmin`. Writes `disbursed`, `disbursed_amount` (defaults to `net_payable`), `approved_by_id`.
- A smaller `disbursedAmount` becomes next month's `pending_balance_in` via `lastDisbursedRemainder`.

#### `setSalaryAmountPaid(id, amount)` / `setSalaryPaid(id, paid)`

Both are thin shells over a private `writePayment(id, amount | "full")`.

- **Auth:** `requireUser()` + `isFinanceViewer(me)` — admins, super-admins, **or the Accounts
  department**. Deliberately *not* `requireAdmin`, because an Accounts member is not `isAdmin`.
- The payable is **recomputed server-side** (`totalPayable`); the client's idea of it is never an
  input. An over-amount is **clamped**, not rejected.
- Writes `amount_paid`, `paid`, `paid_at`, `paid_by_id`. A partial payment leaves the audit stamps alone.
- On the **not-settled → settled edge only**, defers `mailPayslipOnPaid(id)` past the response.
  Re-entering the same settled amount is a no-op that sends nothing.

#### `setWaiveOff({ rowId, days, note })` — super-admin only

`requireAdmin` + `isSuperAdmin(me.email)`. Days 0–366, stored to 2 dp. Purely additive to the
**displayed** net; `final_payment` is never mutated.

#### `setPayoutAdjustment({ rowId, amount, note })` — super-admin only

Signed ±, capped at ±₹1,00,00,000. Same additive pattern.

#### `setSalaryNote(id, note)` — super-admin only

Writes `admin_note` (500 chars). Survives sheet re-syncs.

#### `upsertSalaryProfile(input)` — `app/(admin)/admin/salary-profiles/actions.ts`

- `requireAdmin`. One transaction writing `salary_profiles` (CTC, TDS, `pt_exempt`, `pay_type`,
  rate fields) **and** `employees` (`designation_id`, `paying_entity_id`, `probation_end`,
  **`worker_type`**). Audited to `employee_events` as `salary_profile_set`.
- `pay_type` is **derived** from `worker_type` via `payBasisFor`, never hand-set.
- **Does not touch the `att_*` schedule columns** — those have their own admin.

#### `addAdvance` / `deleteAdvance` / `fetchAdvances`

`requireAdmin`. `fy` derived from the month. Both mutations audited to `employee_events`.

#### `previewSalaryImport` / `confirmSalaryImport` / `undoSalaryImport` — `app/(app)/salary/import/actions.ts`

- `requireAdmin`. Parses an Altus-Log Summary XLSX, matches employee names.
- Writes `salary_runs` with `source='imported'`, tagged by `import_batch_id`; the conflict update is
  guarded by `setWhere: eq(salaryRuns.source, "imported")` so it can never overwrite a generated run.
- **Uses legacy `computeSalary` only**, always with `lateMarks / advances / pendingBalanceIn = 0`.

### Indirect writers — the actions that silently reprice pay

| Action | Auth | Salary effect |
|---|---|---|
| `decideLeave` / `adminMarkLeave` / `cancelLeave` — `app/(app)/attendance/leave/actions.ts` | `requireUser` + `leaveReviewScopeFor` (admin, or manager over their transitive downline) | Each **awaits** `repriceOpenMonth()` → `refreshPayAfterAttendanceChange` → `refreshOpenMonthRun(force: true)`. **Rewrites `salary_runs` and mirrors money into `salary_breakup`.** Fully swallowed on failure — the decision stands whatever payroll did. |
| `addAdHocHoliday` / `removeAdHocHoliday` — `app/(app)/hr/holidays/actions.ts` | `canManageHolidays` — **two named emails only** | No direct write. Revalidates `/my-salary` and `/salary`. Because holidays shrink target hours, the next open-month refresh re-prices every employee's hourly rate. |
| `addHoliday` / `updateHoliday` / `removeHoliday` — `app/(admin)/admin/holidays/actions.ts` | Narrowed from `requireAdmin` to the same two-email list | Same indirect repricing. |
| **Any My Salary page view** — `app/(app)/my-salary/page.tsx` | `getCurrentEmployee` | `loadMySalaryMonths` calls `refreshOpenMonthRun` **before reading**. Throttled to once per 5 min per employee; refuses to touch a disbursed run. **A read request performs a write.** |
| Admin punch correction (attendance actions) | attendance permissions | No salary hook. Changes worked minutes, therefore the open month's pay on the next refresh — and changes nothing for a closed month whose run is already frozen. |

### Route handlers & pages — reads

| Route | Method | Auth / authz | Response |
|---|---|---|---|
| `/salary/payslip/[runId]` | GET | `requireUser`; then `me.isAdmin \|\| me.id === run.employeeId` else 403 | A4 pdfkit payslip: CTC/12, payable days, late-deduction days, additional-hours line, gross, PT, TDS, advances, pending b/f, net in words |
| `/salary/annual-statement/[employeeId]` | GET `?year` | `requireUser`; admin or self. 404 when `SALARY_STATEMENTS=false` | FY Apr–Mar statement PDF, built from `salary_breakup` only |
| `/salary/earnings/[employeeId]` | GET `?month&name&view` | `requireUser`; admin or self | Combined earnings PDF: salary + attendance ratios + incentive + retention |
| `/salary/export.csv`<br>`/salary/export.pdf`<br>`/salary/export.xlsx` | GET `?month` | `requireUser` + `isFinanceViewer` | Payroll register from `toPayrollRows`; `netPayable = final_payment + waiveAddBack + adjustment` |
| `/salary/documents/pdf` | POST | `requireUser` + `me.isAdmin` | Bulk statement generation |
| `/api/mobile/salary` | GET | `authenticateMobileRequest`; self-scoped by construction | JSON history straight from `salary_breakup`. **Does not read `salary_runs`.** |
| `/api/cron/salary-sync` | GET/POST | `Bearer CRON_SECRET`; kill-switch `SALARY_SYNC_OFF` | Google-Sheet → `salary_breakup` mirror. **Not scheduled in `vercel.json` — inert today.** |
| `/api/cron/attendance-weekly`<br>`/api/cron/attendance-monthly` | GET/POST | `Bearer CRON_SECRET` | Report emails carrying a *third* salary-loss formula — see §14 |
| `/api/mobile/overtime` | GET / POST | `authenticateMobileRequest` | `overtime_entries` — **not connected to pay** |
| `/api/mobile/holidays` | GET `?fy` | `authenticateMobileRequest` | The published calendar |
| `/salary` *(page)* | — | `requireFinanceAccess` → admin, super-admin, or Accounts dept; else redirect `/hub` | Accounts salary register. Defaults to the **last complete** month, not the current one. |
| `/my-salary` *(page)* | — | Any signed-in non-candidate. `?emp=` re-checked by `canViewSalaryOf`: self, admin → anyone, manager → transitive downline | The self-service card — §13 |
| `/hr/salary-slip` *(page)* | — | Any signed-in employee; self-scoped, no employee parameter exists | Own slips, **paid months only** |
| `/admin/salary-profiles` *(page)* | — | `requireAdmin` | CTC / worker-type / advances editor |
| `/salary/ctc`, `/salary/analytics`, `/salary/policy`, `/salary/incentive-payout`, `/salary/documents` | — | Finance / admin | CTC breakup drafting (behind `SALARY_V2`), discipline ratios, policy PDF + consent, incentive payouts |

---

## 04 · Services and functions

The pure core is five files. Everything else assembles inputs for it or renders its output.

| Function | File | Responsibility |
|---|---|---|
| `resolveEffectiveConfig(emp, org)` | `lib/attendance/effective-config.ts` | **THE** schedule resolver. Precedence: explicit per-employee override → derived from official start/end → org default → hardcoded fallback |
| `computeDayCode(punch, sched, ctx, refNow)` | `lib/attendance/status.ts` | One day → one code + day value + worked minutes + late/early flags |
| `reconcileMonth(days, opts)` | `lib/attendance/hour-balance.ts` | Weekly targets, signed carry between weeks, deviation waiver, monthly half-day grace |
| `payableHoursForMonth(days, recon, dailyTgt)` | `lib/attendance/hour-balance.ts` | Target hours, payable hours, unpaid-leave days, net surplus |
| `payableDaysByHours(days, dayMinutes)` | `lib/attendance/hours-rule.ts` | Worked hours → attendance days, per week, capped at days expected |
| `computeScheduleHourlySalary(i)` | `lib/salary/compute.ts` | **The current full-timer formula** |
| `computeHourlySalary(i)` | `lib/salary/compute.ts` | **The current hourly-shift formula** |
| `computeSalary(i)` | `lib/salary/compute.ts` | Legacy day-based formula. Still live for months `< 2026-08` and for XLSX import |
| `computeFixedFeeSalary(i)` | `lib/salary/compute.ts` | Retainer. No employee currently carries this basis |
| `calendarHourlyRate(anchor, wkHrs, dim)` | `lib/salary/compute.ts` | The *declared* canonical rate for shift workers; used by the week-loss report and the admin preview |
| `assembleMonthInputs(month)` | `lib/salary/generate.ts` | Builds one `MonthInputRow` per active employee. DB reads only |
| `computeForRow(row)` | `lib/salary/generate.ts` | Routes to the correct pure function by pay basis |
| `refreshOpenMonthRun(empId, month)` | `lib/salary/refresh-open-month.ts` | Recompute + persist the open month. Refuses closed months and disbursed runs; 5-minute throttle unless forced |
| `loadMySalaryMonths(empId, workerType)` | `lib/salary/my-salary.ts` | Three-tier merge (live-refresh → runs → legacy breakup), then re-grades every month's days |
| `syncBreakupFromApp(month)` | `lib/salary/breakup-from-app.ts` | Mirrors computed payroll **and day counts** into `salary_breakup`, preserving human overlays |
| `netAfterWaiveOff(r)` / `totalPayable(r)` | `lib/salary/waive-off.ts`, `payment.ts` | The effective amount to pay: `final_payment + waiveAddBack + payout_adjustment` |
| `isPtExempt({ employeeId, designationName })` | `lib/salary/pt-policy.ts` | Two hardcoded UUIDs plus an "intern" substring match |
| `payBasisFor` / `gradingModeFor` / `earnsOvertime` / `isHourlyShift` / `hourlyMonthlyAnchor` | `lib/attendance/worker-type.ts` | The single branch point for "how is this person treated" |
| `leaveCycleFor` / `proRataAllowance` / `leaveDays` / `isHalfLeaveDay` | `lib/attendance/leave-cycle.ts` | Paid-leave periods, pro-rata entitlement, half-day arithmetic |
| `computeWeekLoss(...)` | `lib/attendance/week-loss.ts` | The Monday "what last week cost you" dialog — a **separate** pricing model |

> **⚠ Dead or near-dead salary code.**
> `lib/salary/proration.ts` (`prorateV2`, `advanceSchedule`) has **zero importers**.
> `lib/salary/adjustments.ts` (`applyAdjustments`) is imported only by a client form under the
> `SALARY_V2` flag, which is default-off. `lib/salary/config.ts` (`getSalaryConfig`,
> `resolveDivisor`) is not on the live pay path. `components/salary/salary-report.tsx`,
> `salary-sync-button.tsx` and `salary-import-dialog.tsx` are mounted nowhere.

---

## 05 · Exact formulas

Every number below is transcribed from the implementation, with rounding as written. Where two
formulas exist for one concept, both are given and the live one is marked.

`round2(n) = Math.round((n + Number.EPSILON) * 100) / 100` throughout.

### A · Base salary — the monthly anchor

```
// full_time — lib/salary/generate.ts:128
monthlySalary = annual_ctc / 12          // no rounding at this point

// hourly shifts — lib/attendance/worker-type.ts hourlyMonthlyAnchor()
anchor = monthly_pay_at_target > 0
       ? monthly_pay_at_target           // the admin field ALWAYS wins
       : (annual_ctc > 0 ? annual_ctc / 12 : 0)

// fixed_fee
gross = round2(monthly_fee)              // attendance never moves it
```

**Live:** all three. **Exception:** if `monthly_pay_at_target` is set but wrong, it silently
overrides CTC — see §17.

### B · Hourly rate — three different denominators exist

```
B1 · SCHEDULE-HOURLY  (full_time, months ≥ 2026-08) — compute.ts:282
   hourlyRate = monthlySalary / monthlyTargetHours
   where monthlyTargetHours = payableHoursForMonth().targetHours
   i.e. schedule-derived, holidays and weekly offs already removed

B2 · ELIGIBLE-TARGET HOURLY  (hourly shifts) — compute.ts:150-163
   calendarTarget  = weekly_target_hours × daysInMonth / 7
   eligible        = (payroll.monthlyTargetHours ≥ calendarTarget × 0.5
                       AND > 0) ? payroll.monthlyTargetHours : null
   rateTargetHours = eligible ?? calendarTarget
   hourlyRate      = anchor / rateTargetHours

B3 · CALENDAR RATE  (week-loss report, admin preview) — compute.ts:106
   hourlyRate = anchor / (weekly_target_hours × daysInMonth / 7)
   // deliberately ignores holidays; declared "THE canonical hourly rate" in
   // its own docblock, yet payroll does not use it
```

**Guard, B2:** the `× 0.5` floor stops a sparsely-graded month from exploding the rate. In
production this guard fires often — Rudra Thukarul's Aug target of 30h was below half of 132.86h,
so his rate divided by the calendar target instead.

### C · Daily rate

```
C1  perDay = monthlyCtc / daysInMonth        // calendar days 28-31
    compute.ts:117 (legacy pay) and analytics/finance.ts:184

C2  perDay = monthlyCtc / (days_in_month ?: 30)
    waive-off.ts perDayRate() — prices condoned days and the
    wave-off add-back on the Accounts page

C3  perDay = monthlyGross / workingDays      // NOT calendar days
    lib/reports/attendance-report-data.ts:49 — the weekly and
    monthly report EMAILS
```

Three conventions, three answers. For a ₹22,000 month with 31 calendar days and 24 working days:
C1/C2 = **₹709.68**, C3 = **₹916.67** — a 29 % divergence on the same person, same month.

### D · Target hours

```
// per week, prorated to the ordinary days present — hour-balance.ts:186
weekTarget = round( weeklyTargetMinutes × expectedDays / max(1, 6) )
   expectedDays = count of days in the week with code ∈ {P, H/D, A}

totalTargetMinutes = Σ weekTarget over the month's weeks

// then, hour-balance.ts:390
creditedMinutes = dailyTargetMinutes × count(code ∈ {PL, CO, HP, H-H/D})
targetMinutes   = totalTargetMinutes + creditedMinutes
targetHours     = targetMinutes / 60      // may be fractional
```

**Why holidays need no special case.** A holiday grades `H`, which is not in `{P, H/D, A}`, so it
never enters `expectedDays` and the month's requirement falls by exactly one scheduled day
automatically. The same is true of weekly offs, paid leave, comp-off and unpaid leave.
**But `HP` and `H-H/D` — worked on a holiday — *add* a day's worth of credited minutes to the
target**, which is how a worked holiday raises target hours by 9 h without adding an ordinary day.

### E · Worked hours

```
// per day — status.ts
worked = max(0, toMin(outAt ?? refNow) − toMin(inAt))
   refNow = live clock for TODAY, "23:59" for any past day
   No break deduction. No cap. A 07:30 → 20:17 day counts all 767 minutes.

// month, ordinary days only — hour-balance.ts:198
totalActualMinutes = Σ worked over days with code ∈ {P, H/D, A}
   Hours worked on a holiday or weekly off are EXCLUDED here.
```

### F · Deficit hours

```
// per week, against the carry-adjusted target — hour-balance.ts
carryIn         = signed balance from earlier weeks of the SAME month
effectiveTarget = max(0, weekTarget − carryIn)
deficit         = max(0, effectiveTarget − actualMinutes)
closingBalance  = carryIn + (actualMinutes − weekTarget)

// month end
monthlyHourBalanceMinutes = totalActual − totalTarget   // signed
```

Both directions carry. A +4 h week lowers next week's effective target to 50 h; a −4 h week raises
it to 58 h, floored at zero. The balance **resets to zero at every month boundary** — August
surplus can never pay for a September shortfall, and an August deficit never follows anyone into
September. A week straddling the boundary is split, and its target prorated to the days present in
that portion.

### G · Surplus hours

```
netSurplusMinutes = max(0, totalActualMinutes − totalTargetMinutes)
   Netted across the WHOLE month: a 50h week followed by a 58h week
   nets to zero and pays nothing extra, in either order.
```

### H · Overtime / additional hours

```
// gate — worker-type.ts earnsOvertime()
earnsOvertime(w) = isHourlyShift(w) = w ∈ {hybrid, first_half, second_half}
   full_time → false.  project_remote → false.

H1 · SCHEDULE-HOURLY (full_time)
   overtimeHours = 0                     // gated to 0 in generate.ts:139

H2 · HOURLY SHIFTS — compute.ts:176
   expectedHours  = eligible ?? overtimeThresholdHours ?? rateTargetHours
   overtimeHours  = max(0, floor(workedMinutes/60) − expectedHours)
   overtimeAmount = round2(hourlyRate × overtimeHours)
   NO PREMIUM. Paid at exactly the same rate as base hours.

   gross = overtimeEligible
         ? round2(hourlyRate × workedHours)               // UNCAPPED
         : round2(min(hourlyRate × workedHours, anchor))  // capped
```

`overtimeThresholdHours` = `payroll.requiredElapsedMinutes / 60` — elapsed working days × daily
target, the same "Required Hours" the Attendance page shows.

### I · Salary deduction — the full-timer engine

```
// lib/salary/compute.ts computeScheduleHourlySalary()
hourlyRate          = monthlySalary / monthlyTargetHours
payableHours        = max(0, floor(payableHoursRaw))       // 53.9h → 53h
halfDayPenaltyHours = chargeableHalfDays × (dailyTargetHours / 2)
unpaidLeaveHours    = max(0, unpaidLeaveDays) × dailyTargetHours
paidHours           = max(0, payableHours − halfDayPenaltyHours − unpaidLeaveHours)

base     = min(hourlyRate × paidHours, monthlySalary)      // capped
otAmount = round2(hourlyRate × overtimeHours)              // 0 for full-timers
gross    = round2(base + otAmount)                         // OT sits outside the cap
pt       = ptExempt ? 0 : 200
net      = round2(gross − pt − tdsMonthly − advances + pendingBalanceIn)

// and where payableHoursRaw comes from — hour-balance.ts:377
ordinaryPayable   = min(totalActualMinutes, totalTargetMinutes)
payableMinutesRaw = ordinaryPayable + creditedMinutes
```

**The two clamps that define this system.** `min(actual, target)` at the hours layer means
**surplus hours die there** for a full-timer — they balance short weeks and are never money.
`min(rate × hours, monthlySalary)` at the money layer is a second, redundant belt. Together they
make a full-timer's gross a pure *reduction* from CTC/12: it can go down, never up.

### J · Salary lost — computed three different ways

```
J1 · My Salary card — my-salary.ts:227
   attendanceDeduction = hourly ? 0
       : max(0, round(annual_ctc/12 − (gross − overtimeAmount)))

J2 · Attendance KPI — attendance-summary.ts:352-414
   Re-runs reconcileMonth + payableHoursForMonth + computeScheduleHourlySalary
   with ptExempt:true, tds:0, advances:0, pending:0, then
   loss = max(0, round(monthlySalary − (gross − overtimeAmount)))
   Returns 0 for any month < "2026-08"; returns 0 for hourly and fixed_fee.

J3 · Workforce finance dashboard — analytics/finance.ts:186-192
   perDay      = annual_ctc / 12 / daysInMonth
   absenceLoss = absentDays        × perDay
   halfDayLoss = halfDays  × 0.5   × perDay
   unpaidLoss  = unpaidLeaveDays   × perDay
   latePenalty = 0                 // retired, pinned to zero
   totalLoss   = sum of the four
```

J1 and J2 agree by construction (same function, same rounding). **J3 does not** — it prices a
day-shortfall against a calendar-day rate, while the payslip prices an hour-shortfall against a
schedule-hour rate. J3 also charges every half-day, whereas the payslip waives the first three
per month.

### K · Paid leave

```
code      = "PL", dayValue = 1
target   += dailyTargetMinutes     (PL ∈ PAID_CREDITED_CODES)
payable  += dailyTargetMinutes     (added to BOTH sides — they cancel)
ordinary  = NO   → contributes no hour expectation, no deficit
net salary effect = ZERO. A full month of paid leave pays in full.
```

### L · Unpaid leave

```
code       = "LWP", dayValue = 0
ordinary   = NO  → the day leaves the target, so no deficit is invented
credited   = NO  → adds nothing to payable

// Left alone the two cancel and LWP would cost nothing. So it is counted
// separately and charged ONCE, in the money function:

unpaidLeaveHours = unpaidLeaveDays × dailyTargetHours
cost             = hourlyRate × unpaidLeaveHours
     e.g. 1 day, ₹22,000 / 216h = ₹101.85/h × 9h = ₹916.67

// Charged the moment the leave is APPROVED — decideLeave awaits
// refreshOpenMonthRun(force: true).

CAVEAT: a HALF-day of unpaid leave is NOT counted here. The grader splits
that day into H/D or A, which are ordinary, so the hours rule has already
charged for the unworked half.
```

### M · Holidays

```
Not worked  → code "H",     dayValue 1, ordinary NO, credited NO
              → the month's target falls by one scheduled day
              → the hourly rate RISES (same salary ÷ smaller target)
              → a holiday costs the employee nothing

Worked ≥ halfDayMinutes → code "HP",    dayValue 2
Worked > 0 but under    → code "H-H/D", dayValue 1.5
   Both are credited: target += 9h AND payable += 9h.
   Actual hours worked that day are NOT added to totalActualMinutes.
```

> **⚠ The 2× is display-only under the hourly engine.** `dayValue 2` and `1.5` flow into
> `summary.payableDays` ("Effective Days Worked") and into the *legacy* day-based pay path. Under
> the schedule-hourly engine that governs 2026-08 onward, HP contributes exactly
> `dailyTargetMinutes` to both sides — so **working a holiday is paid the same as taking it off**,
> and the hours actually worked that day are discarded.

### N · Remote work

```
wfh | client_site | field
   → attached to DayRow.remoteMode for the calendar badge, and nothing else.
   → same code, same dayValue, same workedMinutes, same pay as an office day.
   → PENDING and REJECTED requests are excluded from the map entirely.
   → the agreed start/end times on the request are NOT enforced at grading.
```

### O · Half days

```
// Origin 1 — the three-tier rule (non-hourly types only)
halfDayMinutes ≤ worked < fullDayMinutes  → "H/D", 0.5
   against a 9h day: 4.5h ≤ worked < 7.5h

// Origin 2 — missing punch, ANY worker type
in without out            → "H/D", 0.5
out without in            → "H/D", 0.5
out written by the cron   → "H/D", 0.5   (ctx.autoClosed)

// Origin 3 — half-day leave boundary (status.ts halfLeaveDay)
PAID   + worked ≥ halfDayMinutes → "P"   1.0
PAID   + didn't                  → "H/D" 0.5
UNPAID + worked ≥ halfDayMinutes → "H/D" 0.5
UNPAID + didn't                  → "A"   0.0
   late and early marks are SUPPRESSED on these days, deliberately

// Charging — hour-balance.ts:230-247
A half-day inside a week where actual ≥ waiverThreshold is ABSORBED
   and does NOT consume a grace slot.
Remaining half-days are numbered 1,2,3,… in date order.
   ordinal ≤ 3  → waived (warning only)
   ordinal ≥ 4  → chargeable at 0.5 × dailyTargetHours × hourlyRate
```

### P · Full days · Q · Absences

```
// non-hourly types — ratios of that employee's OWN daily target
fullDayMinutes = att_full_day_minutes ?? round(dailyTarget × 7.5/9)
halfDayMinutes = att_half_day_minutes ?? round(dailyTarget × 4.5/9)
   worked ≥ fullDayMinutes → "P"   1.0
   worked ≥ halfDayMinutes → "H/D" 0.5
   below                   → "A"   0.0   ← present but under the floor

// hourly shifts — NO half-day tier at all
fullDayMinutes = halfDayMinutes = round(dailyTargetMinutes)
   worked ≥ target → "P"
   below           → "A"

// no punch at all, not a holiday/off/leave day
   → "A", dayValue 0, workedMinutes 0
   Every future working day of the current month grades "A".
```

A late arrival or early exit that still lands a full day is **forgiven** (`lateWaived = true`);
the day stays `P`.

### R · Grace and condoned time

```
1. Late grace       lateAfter = officialStart + 50 min, when not explicitly
                    overridden (LATE_GRACE_MINUTES)
2. Late waiver      worked ≥ fullDayMinutes AND (late OR leftEarly)
                    → lateWaived = true, day still "P"
3. Weekly waiver    weekActual ≥ round(waiverThreshold × expectedDays / 6)
                    → that week's half-days absorbed, no grace slot used
4. Monthly grace    first 3 surviving half-days waived
5. Late deduction   floor(lateMarks / 3) × 0.5 days
                    RETIRED. generate.ts pins applyLate = false, so
                    lateMarksInMonth is always passed as 0 and
                    lateDeductionDays is always 0. Marks are still
                    counted and displayed.
6. Wave-off         super-admin grants N condoned days on the salary_breakup
                    row; the DISPLAYED net gains N × (monthly_ctc /
                    days_in_month). The stored final_payment is never mutated.
```

### S · Other adjustments

```
advances          = Σ salary_advances WHERE employee_id, month    (subtracted)
pendingBalanceIn  = max(0, netPayable − coalesce(disbursedAmount, netPayable))
                    of the most recent DISBURSED run before this month  (added)
pt                = 200 unless exempt
tds               = salary_profiles.tds_monthly, flat ₹/month
payoutAdjustment  = signed ±, super-admin, ±₹1 crore cap
waiveAddBack      = waive_off_days × (monthly_ctc / days_in_month)

// what the Accounts page and every export actually pay:
netAfterWaiveOff = final_payment + waiveAddBack + payoutAdjustment
unpaidBalance    = max(0, round2(netAfterWaiveOff) − amount_paid)
status           = unpaidBalance ≤ 0.5 ? "paid"
                 : amount_paid > 0     ? "partial"
                 :                       "unpaid"
```

---

## 06 · Employee type logic

Five values exist in the enum; four appear in the picker; three have live employees. Everything
downstream branches on `employees.worker_type`.

| Type | Live rows | Pay basis | Grading | Daily target | Weekly target | Half-day tier | Paid leave | Overtime paid |
|---|---:|---|---|---|---|---|---|---|
| **`full_time`** | 18 active / 23 | `monthly_ctc` | `day` | official end − start, else 9 h | daily × 6 | Yes — 4.5 h / 7.5 h ratios | Yes | **No** |
| **`hybrid`** | 4 active | `hourly` | `hours` | weekly / 6 | `weekly_target_minutes` ?? 30 h | **No** | No | Yes |
| **`second_half`** | 1 active / 2 | `hourly` | `day` | weekly / 6 | `weekly_target_minutes` ?? 30 h | **No** | No | Yes |
| **`first_half`** | 0 | `hourly` | `day` | weekly / 6 | `weekly_target_minutes` ?? 30 h | **No** | No | Yes |
| `project_remote` | 0 | `fixed_fee` | `session` | 9 h | 54 h | Yes | No | No (retainer) |

Legacy values still mapped by `asWorkerType`: `afternoon_shift → second_half`, `part_time → hybrid`.
Anything unrecognised falls back to `full_time`.

### Where each number comes from — dynamic vs hardcoded

| Quantity | Source | Verdict |
|---|---|---|
| Working days per week | `WORKING_DAYS_PER_WEEK = 6` | **Hardcoded.** Mon–Sat for every type. `employees.working_days` exists but the attendance engine never reads it |
| Weekly off | `employees.weekly_off` | Dynamic — **a single integer**, so exactly one day off per week is representable. Every live row is 0 (Sunday) |
| Full-timer daily target | `att_official_end − att_official_start` | Dynamic. Falls back to 9 h when either is null or the span is ≤ 0 |
| Hourly-shift daily target | `weekly_target_minutes / 6` | Dynamic. The official start/end is treated as an *attendance window*, not the hours owed — deliberately, because these rows carry windows like 03:00–20:00 |
| Hourly-shift weekly default | `PART_TIME_DAILY_MINUTES × 6 = 30 h` | **Hardcoded** fallback. All 5 live hourly rows set 1800 min explicitly, so the fallback is not in use |
| Full/half-day cutoffs | `att_full_day_minutes` / `att_half_day_minutes`, else ratios | Dynamic override; ratios `7.5/9` and `4.5/9` are hardcoded. Only 1 live row sets an override (300/180) |
| Late grace | `att_late_after`, else start + 50 min, else org, else 10:50 | Four-level fallback. 14 of 18 active full-timers set it explicitly |
| Hourly anchor | `salary_profiles.monthly_pay_at_target` | Dynamic, and **unconditionally overrides CTC** whenever > 0 |
| PT ₹200 | `PT_AMOUNT` in `compute.ts` *and* `pt-policy.ts` *and* `salary_config.default_pt` | **Hardcoded twice, configured once, and the config row is never read** |

> **⚠ Admin Panel shows a target it does not resolve.**
> `components/admin/employee-editor/schedule-format.ts` derives its "9h/day · 54h/week" requirement
> line from worker-type *defaults* alone — it never calls `resolveEffectiveConfig`, so it ignores
> `att_official_start/end`, `weekly_target_minutes` and the per-employee minute overrides. Its
> docblock also claims `DEFAULT_PART_TIME_WEEK_MINUTES` is 27 h; the constant is 30 h. The same
> stale "27 h / 4.5 h" figures appear in the docblocks of `worker-type.ts` and `compute.ts`.

---

## 07 · Attendance → salary, day by day

One employee, one month. This is the exact order `gradeMonth` walks, and the exact precedence
`computeDayCode` applies.

### Precedence inside `computeDayCode`

1. **Half-day leave** — if `leave` and `leaveHalf`, branch to `halfLeaveDay` and stop.
2. **Paid leave** → `PL`, 1.0. **Unpaid leave** → `LWP`, 0.0. Punches on that day are discarded.
3. **Redeemed comp-off** → `CO`, 1.0.
4. **Holiday or weekly off** — with an in-punch: `HP` (2.0) when worked ≥ `halfDayMinutes`, else
   `H-H/D` (1.5) when worked > 0. Otherwise `H` or `W/O`, 1.0.
5. **No in-punch** — an out-punch alone gives `H/D` 0.5; nothing at all gives `A` 0.0.
6. **In but no out** → `H/D` 0.5. **Out written by the cron** (`ctx.autoClosed`) → `H/D` 0.5.
7. **Three-tier rule** on worked minutes.

Two context rules are applied by the query layer *before* the engine runs: a **holiday during an
approved leave passes `leave: null`**, so the holiday credit stands and the leave day is not
burned; and a **converted comp-off day is graded as if unpunched**, so it yields `H`/`W/O` rather
than `HP`.

### Every situation, resolved

| Situation | Code | Day value | Ordinary? | Target effect | Pay effect (schedule-hourly) |
|---|---|---:|---|---|---|
| Full day worked | `P` | 1.0 | Yes | + dailyTarget | Its worked minutes count toward payable |
| Half day (hours or missing punch) | `H/D` | 0.5 | Yes | + dailyTarget | Hours count; from the 4th such day, −0.5 day of pay |
| Absent (no punch, or under the floor) | `A` | 0 | Yes | + dailyTarget | Creates the hour deficit that reduces gross |
| Holiday, not worked | `H` | 1.0 | No | none | **₹0.** Target shrinks; rate rises |
| Weekly off, not worked | `W/O` | 1.0 | No | none | **₹0** |
| Worked on a holiday / weekly off | `HP` | 2.0 | No | + dailyTarget (credited) | Credited to both sides → nets to ₹0. Hours worked discarded |
| Worked part of a holiday / off | `H-H/D` | 1.5 | No | + dailyTarget (credited) | Same — nets to ₹0 |
| Approved paid leave | `PL` | 1.0 | No | + dailyTarget (credited) | **₹0** — paid in full |
| Approved unpaid leave | `LWP` | 0 | No | none | **−1 day × hourlyRate**, charged explicitly |
| Redeemed comp-off | `CO` | 1.0 | No | + dailyTarget (credited) | **₹0** |
| Late arrival | *(flag)* | — | — | none | No direct charge. Waived outright if the day still reaches full. Its cost is simply fewer worked minutes |
| Early departure | *(flag)* | — | — | none | Same — fewer minutes, no separate penalty |
| Missing punch-out | `H/D` | 0.5 | Yes | + dailyTarget | Worked minutes counted up to 23:59 for a past day |
| Remote work (approved) | as punched | — | — | none | **Identical to an office day** |
| Before joining | `–` | 0 | Excluded | none | Filtered out before reconciliation |

> **⚠ The "absent future" problem.** `gradeMonth` walks *every calendar day of the month*,
> including days that have not happened. A future working day has no punches, so it grades `A` with
> a full `dailyTargetMinutes` of target. The KPI surfaces work around this by filtering
> `logDate ≤ today` — but **`reconcileMonth` and `payableHoursForMonth` do not**. The open month's
> `target_hours` is therefore always the *whole* month, while `payableHours` only ever reflects
> elapsed days. Mid-month, the open-month run reports a large artificial deficit; it corrects
> itself only once the month ends.

---

## 08 · Holiday logic

Three calendars are merged into one date set, per calendar year, and any employee whose punch day
falls in it is off.

```
// lib/queries/holidays.ts listHolidayDateSet(year)
suppressed = { d : holidays row for d exists AND is_active = false }

dates = publishedHolidayDates(year)                    // HOLIDAYS_2026 in code
      ∪ { d : holidays row is_active = true }          // admin + HR ad-hoc
      ∪ { d : event_holidays row where
                is_office_closed AND NOT is_optional
                AND NOT is_festival_marker
                AND NOT is_exam_marker
                AND applies_to ∈ ('all','custom') }    // Events Master

return dates minus suppressed
```

- **Matching to employees:** none. The set is date-only and applies to *every* employee
  identically. Religion-targeted days are excluded here (the `applies_to` filter) and handled only
  by the personalised reader at `lib/queries/upcoming-holidays.ts`.
- **Do holidays reduce target hours?** Yes. `H` is not an ordinary day, so it never enters
  `expectedDays`. One holiday in a Mon–Sat week takes the week's target from 54 h to 45 h.
- **Do they affect working days?** Yes — `OFF_CODES` excludes `H` from the working-day denominator
  on every KPI surface.
- **Do they affect salary?** Only by *raising the hourly rate*. `rate = monthlySalary / targetHours`,
  so a smaller target means each hour is worth more and a complete month still pays exactly
  `monthlySalary`.
- **Are holidays counted as worked hours?** No. An unworked holiday contributes
  `workedMinutes = 0` and is excluded from `totalActualMinutes` entirely.
- **Working on a holiday:** grades `HP` (2.0) or `H-H/D` (1.5). Under the schedule-hourly engine
  that day adds `dailyTargetMinutes` to *both* target and payable — so it nets to zero, and the
  actual hours worked are discarded. The 2× premium survives only in `summary.payableDays` and in
  the legacy day-based path.
- **Cancelling a published holiday:** the published list is code and cannot be edited from the app.
  The only mechanism is to add the date in the Admin Panel and toggle it **Inactive**.
- **Who can change it:** two named email addresses — `ruchitaambre.altuscorp@gmail.com` and
  `rutvishamehta.altuscorp@gmail.com`. Not admins, not super-admins.
- **Fail-safe:** if the Events Master read fails, the admin list and published list still apply.

> **⚠ Live inconsistency between the two holiday sources.** Production carries **17 holiday rows
> for 2026**. Rakshabandhan (28 Aug 2026) exists in `holidays` as active *and* in `event_holidays`
> with `is_festival_marker = true` — which would exclude it from the Events Master branch on its
> own. It still grades as a holiday because the `holidays` row carries it. The three-calendar union
> means a date's status can depend on which table happens to be authoritative, and the flags on the
> Events Master row are not consistent with the intent recorded elsewhere.

---

## 09 · Leave logic

Request → approval → attendance → salary. Only approved rows ever reach the grader, and only
`kind` matters to money.

```
1. requestLeave    → status 'pending'. Paid leave REFUSED for any
                     non-full-timer (leaveKindAllowedFor).
2. decideLeave     → 'approved' | 'rejected'. Reviewer must be an admin
                     or a manager over the requester's transitive downline.
                     → awaits repriceOpenMonth(employeeId)
3. listEmployeeLeaveForRange(ids, from, to)
                     WHERE status = 'approved'
                       AND start_date <= to AND end_date >= from
4. leaveOn(ymd, leaves) → paid wins if both overlap;
                          isHalfLeaveDay() decides the half flag
5. computeDayCode  → PL | LWP | the half-leave matrix
6. payableHoursForMonth → credits PL, counts LWP days
7. computeScheduleHourlySalary → charges LWP once
```

### PAID LEAVE

| Dimension | Effect |
|---|---|
| Target-hour effect | **Credited**: `+dailyTargetMinutes` to the target |
| Worked-hour effect | 0 worked minutes; the day is **not** ordinary, so it creates no deficit |
| Salary effect | **₹0.** `+dailyTargetMinutes` is added to payable as well — the two cancel |
| Attendance effect | Code `PL`, dayValue 1. Counted in `summary.paidLeave`. Excluded from working days by `OFF_CODES` |

### UNPAID LEAVE

| Dimension | Effect |
|---|---|
| Target-hour effect | **None** — the day leaves the requirement entirely, so no deficit is invented |
| Worked-hour effect | 0; not ordinary |
| Salary effect | **−`dailyTargetHours × hourlyRate`**, charged once inside `computeScheduleHourlySalary` |
| Attendance effect | Code `LWP`, dayValue 0. Counted in `summary.unpaidLeave` |
| When the deduction happens | **At approval.** `decideLeave` awaits `refreshOpenMonthRun(force: true)`, bypassing the 5-minute throttle |

### Other statuses

| Status | Reaches grader? | Salary effect |
|---|---|---|
| `pending` | **No** | Day grades on punches alone → `A` if unpunched |
| `rejected` | No | Same as pending |
| `cancelled` | No | Same. Cancelling after approval re-prices the open month via `cancelLeave` |

### Half-day and partial-day leave

```
// leave-cycle.ts — the flags are deliberately asymmetric
start_half_day = leave begins at MIDDAY on start_date   (morning worked)
end_half_day   = leave ends at MIDDAY on end_date       (afternoon worked)

leaveDays(span):
   total = inclusive days
   if total == 1 → (startHalf OR endHalf) ? 0.5 : 1
   else          → total − (startHalf ? 0.5 : 0) − (endHalf ? 0.5 : 0)

// a DB CHECK (leave_requests_half_day_chk) refuses both flags on a
// single-day leave — they would name the same half twice and cancel
// the day to zero
```

A half-day boundary grades through `halfLeaveDay()`, which measures the worked half against
`halfDayMinutes` rather than `fullDayMinutes` — so honouring a half-leave is a *complete*
performance, not a shortfall. Late and early marks are suppressed on those days on purpose:
someone returning from a morning's leave would otherwise be marked late for keeping exactly the
arrangement that was approved.

**Multi-day leave** is stored as one row spanning `[start_date, end_date]` inclusive; the grader
tests membership per day. A leave straddling a month or cycle boundary is charged to whichever
balance window each day falls in (`leaveDaysInWindow`), and a clipped edge is never treated as a half.

### Paid-leave entitlement

```
Eligible: full_time only. Everyone else may request unpaid only —
enforced in the picker AND in the server action.

Periods (two eras, both six-month halves, both granting 3 then 4):
   before 2026-10-01 → calendar halves  Jan–Jun (3), Jul–Dec (4)
   from   2026-10-01 → financial halves Apr–Sep (3), Oct–Mar (4)

Pro-rata for a mid-period confirmation:
   months    = inclusive months from probation_end to cycleEnd, capped at 6
   allowance = min(full, ceil((full × months / 6) × 2) / 2)   // round UP to ½
   probation_end == null → FULL allowance ("confirmed long ago")

Nothing carries across a boundary; leftover simply lapses.
```

---

## 10 · Remote work logic

Approval gates the **punch**, not the pay. Once a remote day is punched it is arithmetically
indistinguishable from an office day.

```
1. Employee files a request → status 'pending'
     0209: carries start/end times, a repeat pattern (expanded into
     one row per date) and a reason bucket
2. Approver decides (canApproveRemoteWork)
3. On punch: assertRemoteWorkApproved(empId, date, mode)
     → refuses a wfh/client_site/field punch with no approved row
     → 'office' and 'other' are NOT gated
     → a DB trigger (migration 0205) enforces the same rule independently
4. Grading: approvedRemoteWorkMapForRange() attaches DayRow.remoteMode
     — and that is the end of its influence.
```

| Mode | Counts as attendance | Contributes worked hours | Affects target | Affects salary | Affects absence | Affects salary lost |
|---|---|---|---|---|---|---|
| `wfh` | Yes — via its punches | Yes, identically | No | No, beyond the hours punched | No | No |
| `field` | Yes | Yes | No | No | No | No |
| `client_site` | Yes | Yes | No | No | No | No |

The three modes are **indistinguishable to the pay engine**. The only structural difference is that
`client_site` requires a non-null `client_location_id` (a DB CHECK from migration 0205).

The agreed hours on the request are deliberately **not** enforced at grading — the comment in
`remote-work.ts` states that refusing a punch outside them would turn "you agreed to be at the
client from 2pm" into "your 1:55pm arrival is not attendance".

An approved remote day with **no punch** still grades `A`. Approval alone earns nothing.

The remote-work read is wrapped in `.catch(() => new Map())` in both grading paths: a failed read
costs a calendar badge, never a grade or a rupee.

---

## 11 · Monthly calculation — actual execution order

Traced from `generateSalary(month)` downward. This is what runs, in the order it runs.

```
generateSalary({ month })
 1. requireAdmin()  →  rateLimitOrError(me.id, "write")
 2. GenerateSalarySchema.safeParse(input)
 3. assembleMonthInputs(month)
    3.1  dim = daysInMonth(month);  fy = fyForMonth(month)
    3.2  today = localDateString("Asia/Kolkata")
    3.3  applyLate = false                 // late deduction retired
    3.4  profiles = listSalaryProfiles()   // ALL active employees,
                                           // LEFT JOIN salary_profiles
    3.5  branch on month:
         ≥2026-08 → getMonthDashboard(y, m, today)
                    ├ getOrgSettings()
                    ├ SELECT active employees (schedule columns)
                    ├ SELECT all punches for the month (ONE query)
                    ├ listHolidayDateSet(year)            // 3 calendars
                    ├ listEmployeeLeaveForRange(all ids)  // approved only
                    ├ getCompOffMapForRange(all ids)
                    ├ approvedRemoteWorkMapForRange(all)  // fail-soft
                    └ per employee:
                        a. employeeSchedule → resolveEffectiveConfig
                        b. foldPunches(rows, tz)
                        c. gradeMonth: for EVERY calendar day
                             · before joinedAt → "–", value 0
                             · isWeeklyOff = weekday == employees.weekly_off
                             · refNow = live clock if today, else "23:59"
                             · holiday-over-leave: if holiday, leave = null
                             · converted comp-off → grade as if unpunched
                             · computeDayCode(...)
                             · tally()
                        d. summary.payableDays = payableDaysByHours(days)
                             // OVERWRITES the tallied Σ dayValue
                        e. cfg = employeeEffectiveConfig(p, org)
                        f. reconcileMonth(graded, cfg targets)
                        g. payableHoursForMonth(graded, recon, dailyTgt)
                        h. requiredElapsedMinutes =
                             count(days: !weeklyOff ∧ joined
                                   ∧ expectsScheduledHours(code)
                                   ∧ date ≤ today) × dailyTargetMinutes
         =2026-07 → getMonthDashboardMerged   // no payroll view produced
         <2026-07 → getAttendanceSheetPayableMap
    3.6  per employee, SEQUENTIALLY inside the loop:
         payBasis  = payBasisFor(p.workerType)
         ptExempt  = payBasis == "hourly" ? true
                                          : isPtExempt(id, designationName)
         advances         = sumAdvances(employeeId, month)       // 1 query
         pendingBalanceIn = lastDisbursedRemainder(id, month)    // 1 query
         hasProfile = basis-specific check
 4. for each row:
    4.1  if (!row.hasProfile) continue       // no ₹0 run materialised
    4.2  b = computeForRow(row)
         hourly       → computeHourlySalary
         monthly_ctc AND payroll AND targetHours > 0
                      → computeScheduleHourlySalary
         fixed_fee    → computeFixedFeeSalary
         otherwise    → computeSalary         // legacy day-based
    4.3  UPSERT salary_runs ON CONFLICT (employee_id, month)
         SET = computed columns + updated_at ONLY
         // disbursed / disbursed_amount / approved_by_id untouched
 5. syncBreakupFromApp(month)
    5.1  a SECOND getMonthDashboard(...) call for the day counts
    5.2  a SECOND assembleMonthInputs(month) call
    5.3  match salary_breakup row by employee_id, else normalised name
    5.4  UPDATE computed + day columns; overlays preserved
 6. revalidatePath("/salary")
```

> **⚠ Two full grading passes per generate.** Step 3.5 and step 5.1 each run `getMonthDashboard`
> over the whole roster, and step 5.2 re-runs `assembleMonthInputs` — which triggers a third.
> Step 3.6's `sumAdvances` and `lastDisbursedRemainder` are also awaited **inside a per-employee
> loop**, so a 25-person org issues 50 sequential round-trips there alone.

---

## 12 · Daily earnings — does it exist?

**No.** Nothing in this system computes what a single day earned. Two intermediate quantities could
yield one without changing any rule.

The engine is deliberately *month-scoped* and *week-reconciled*. Three properties make a naive
per-day figure wrong:

- `reconcileMonth` carries a signed balance **between weeks**, so Tuesday's shortfall may be
  covered by Thursday's surplus.
- `payableMinutesRaw = min(totalActual, totalTarget)` is a **month-level** clamp — it cannot be
  decomposed into days without deciding which day the clamp bit.
- The half-day grace numbers charges by **ordinal within the month**, so the 4th half-day costs
  money and the 3rd does not. Day 12's cost depends on days 1–11.

### What could be used, unchanged

| Approach | Formula from existing values | Fidelity |
|---|---|---|
| **Hour-priced day** *(closest to the real engine)* | `dayEarned = min(workedMinutes, dailyTargetMinutes)/60 × hourlyRate`, where `hourlyRate = monthlySalary / payableHoursForMonth().targetHours` | Σ over the month equals gross **except** where the month-level clamp, the half-day charge or the LWP charge bit. Both terms already exist on `DayRow` and `salary_runs` |
| **Credited-day pricing** | `PL / CO / HP / H-H/D → dailyTargetHours × hourlyRate`; `H / W-O → ₹0 earned but ₹0 lost`; `LWP → −dailyTargetHours × hourlyRate` | Matches how the engine treats each code. Requires no new rule |
| Calendar per-day rate | `monthlyCtc / daysInMonth` | Already implemented in `waive-off.perDayRate` and `analytics/finance`. **Contradicts** the hourly engine — it is the legacy convention that was superseded |
| Working-day rate | `monthlyGross / workingDays` | Already implemented in `attendance-report-data.perDayRateFor`. Also contradicts the hourly engine |

The values needed for the first two are already computed and already persisted:
`salary_runs.hourly_rate`, `salary_runs.target_hours`, and per-day `workedMinutes` + `code` from
`getEmployeeMonthStatus`. A daily view would be a presentation layer over them, and the month total
would still have to come from the engine so the two never disagree.

---

## 13 · My Salary — the frontend

One server page, one client component, **no client-side money math** — but two independent data
sources stitched into a single card.

### Components

- `app/(app)/my-salary/page.tsx` — server. Resolves the target employee through `canViewSalaryOf`,
  loads `loadSalaryViewAccess` for the picker, calls `loadMySalaryMonths`. `dynamic = "force-dynamic"`.
- `components/salary/salary-person-picker.tsx` — the `?emp=` switcher, shown only when scope ≠ self.
- `components/salary/my-salary-view.tsx` — the whole card. Client, but read-only.
- `components/attendance/month-calendar.tsx` — the graded calendar, fed `cells` and
  `weekTargetMinutes` from the server.

### Data path — three tiers, first match wins

```
0. refreshOpenMonthRun(employeeId, currentMonth)   ← A WRITE
     throttled 5 min · refuses closed months · refuses disbursed runs
1. myRuns(employeeId)          → salary_runs, newest month first
2. mySalaryBreakup(employeeId) → salary_breakup (older history)
     merged legacy-first so runs overwrite it
3. withRealAttendance(...)     → getEmployeeMonthStatus per month,
     Promise.allSettled, fail-soft per month
```

### What each field on the card comes from

| Displayed as | Field | Origin |
|---|---|---|
| Net pay headline | `finalPayment` | `salary_runs.net_payable` |
| Base Salary | `baseAmount` | `gross − overtime_amount` |
| Additional Hours Pay | `overtimeAmount` | `salary_runs.overtime_amount` |
| Deductions | `gross − finalPayment` | Computed in the browser — but purely as a difference of two server figures, so the card always reconciles |
| Attendance Deduction | `attendanceDeduction` | **Server-side**, `my-salary.ts:227`. ₹0 for hourly staff |
| Other Adjustments | `previousPending − pt − advance` | Browser sum of three server figures |
| Required Hours / Hours Worked | `targetHours` / `workedHours` | **Frozen on `salary_runs`** at generation time |
| Less Hours | `max(0, required − worked)` | Browser subtraction of the two frozen figures |
| Working Days / Effective Days / Half Days / Absent Days | `finalWorkingDays`, `present`, `halfDay`, `absent` | **Re-graded live** by `withRealAttendance`, elapsed days only, partitioned so the KPI row always adds up |
| Paid Leave / Unpaid Leave / Extra Days Worked | counts of `PL`+`CO` / `LWP` / `HP` | Counted in the browser from the live-graded `cells` |
| Calendar | `cells` | Live-graded, same mapping the Attendance page uses |
| Paid badge | `paid`, `salaryGiven` | `salary_runs.disbursed` / `disbursed_amount` |

> **Is the frontend recalculating salary independently?**
> **No — but the card mixes two eras of the same month.** Every rupee comes from the server; the
> browser only formats and subtracts figures that already reconcile. The real hazard is elsewhere:
> **money is read from a frozen `salary_runs` row while the day counts and calendar beside it are
> re-graded from today's attendance.** For any closed month whose punches, holidays or leave
> changed after generation, the Hours block and the Attendance block on the same card describe
> different months. §16 shows this happening in production.

### Filters, selectors, history

- **Month selector** — a `<select>` over the loaded months, held in React state (`sel`). No URL
  param, no refetch; every month is already in the payload.
- **History list** — the same array again, rendered as buttons that set `sel`. Shows label +
  `finalPayment` + paid icon.
- **Person picker** — writes `?emp=`, re-validated server-side on every load.
- **Breakdown toggle** — `showDetail`, reset whenever the month changes.
- **No downloadable slip on this page.** Slips live at `/hr/salary-slip` (paid months only) and
  `/salary/payslip/[runId]`.

---

## 14 · Duplicate and conflicting logic

Six concepts have more than one implementation. Four of the duplications produce **different
numbers** for the same employee and month.

### Per-day rate

| Implementation | Formula | Agrees? |
|---|---|---|
| `compute.ts:117` `computeSalary` | `monthlyCtc / daysInMonth` | **Authoritative for months < 2026-08** |
| `waive-off.ts:33` `perDayRate` | `monthlyCtc / (daysInMonth ?: 30)` | Same convention. **Authoritative for wave-off pricing** on all months, including hourly-engine months where it does not match the pay basis |
| `analytics/finance.ts:184` | `annualCtc / 12 / daysInMonth` | Same convention, deliberately documented as matching `compute.ts` |
| `attendance-report-data.ts:49` `perDayRateFor` | `monthlyGross / **workingDays**` | **Conflicts.** ~29 % higher on a typical month. Used only in report emails |

### Hourly rate

| Implementation | Formula | Agrees? |
|---|---|---|
| `compute.ts:282` `computeScheduleHourlySalary` | `monthlySalary / monthlyTargetHours` | **Authoritative** — what the payslip pays for full-timers |
| `compute.ts:162` `computeHourlySalary` | `anchor / (eligibleTarget ?? calendarTarget)` | **Authoritative** for hourly shifts. Different denominator by design; the ≥50 % guard makes it switch conventions mid-roster |
| `compute.ts:106` `calendarHourlyRate` | `anchor / (weeklyHrs × dim/7)` | **Conflicts.** Its own docblock calls it "THE canonical hourly rate… every surface must call this", yet payroll calls neither of the surfaces it names. Used by the Monday week-loss dialog and the admin profile preview only |

### Target hours

| Implementation | Formula | Agrees? |
|---|---|---|
| `hour-balance.ts` `payableHoursForMonth` | Σ weekly prorated targets + credited minutes | **Authoritative** |
| `schedule-format.ts` `targetsFor` | worker-type default only | **Conflicts.** Ignores every per-employee override; drives the Admin Panel's requirement line |

### Attendance → payable

| Implementation | Formula | Agrees? |
|---|---|---|
| `hours-rule.ts` `payableDaysByHours` | per week: `worked/dayMinutes` → nearest ½, capped at expected days | **Authoritative for `summary.payableDays`** and for the legacy day-based pay path |
| `hour-balance.ts` `payableHoursForMonth` | `min(actual, target) + credited`, floor to hour | **Authoritative for money** from 2026-08 |
| `attendance/summary.ts` `summarize` | `deductionDays = workingDays − presentDays` | **Conflicts.** A day-count model; drives `salaryReduced` in the report emails |

### Salary lost

| Implementation | Formula | Agrees? |
|---|---|---|
| `my-salary.ts:227` | `max(0, round(CTC/12 − base))` | **Authoritative** — same function as the next row, agrees to the rupee |
| `attendance-summary.ts` `salaryLostForMonth` | re-runs the engine, then `CTC/12 − base` | **Authoritative** |
| `analytics/finance.ts` | `(absent + ½×half + LWP) × perDay` | **Conflicts.** Different rate, different model, no half-day grace |

### Overtime

| Implementation | Formula | Agrees? |
|---|---|---|
| `compute.ts` (both hourly paths) | `max(0, worked − expected) × same rate` | **Authoritative** |
| `overtime_entries` table + `/overtime` module | manually logged hours, approved/rejected | **Entirely disconnected.** No pay code reads it; 0 rows in production |

### "Which days are off"

| Implementation | Formula | Agrees? |
|---|---|---|
| `attendance-summary.ts` `OFF_CODES` | `{W/O, H, PL, CO, LWP}` | Exported specifically so it is not restated |
| `attendance-report-data.ts:23` | `{W/O, H, PL, CO, LWP}` | An **identical private copy**, acknowledged in the comment on the export it declined to import |

---

## 15 · Every hardcoded value

| Value | Constant | File | Note |
|---|---|---|---|
| `₹200` | `PT_AMOUNT` | `salary/compute.ts:98` | The one actually charged |
| `₹200` | `PT_AMOUNT` | `salary/pt-policy.ts:14` | Exported, never used to charge |
| `₹200` | `default_pt` | `salary_config` table | **Configured but never read by the pay path** |
| 2 UUIDs | `PT_EXEMPT_EMPLOYEE_IDS` | `salary/pt-policy.ts:17` | Named individuals, hardcoded by primary key. `salary_profiles.pt_exempt` is **not consulted** |
| `"intern"` | `isInternDesignation` | `salary/pt-policy.ts:26` | Substring match on the designation name |
| `3` | `MONTHLY_HALF_DAY_GRACE` | `attendance/hour-balance.ts:111` | Half-days waived per month |
| `0.5` | `HALF_DAY_SALARY_FRACTION` | `attendance/hour-balance.ts:114` | |
| `6` | `WORKING_DAYS_PER_WEEK` | `attendance/effective-config.ts:33` | Mon–Sat for every worker type |
| `9 h` | `FULL_TIME_DAILY_MINUTES` | `attendance/effective-config.ts:36` | |
| `5 h` | `PART_TIME_DAILY_MINUTES` | `attendance/effective-config.ts:38` | Docblocks elsewhere still say 4.5 h |
| `30 h` | `DEFAULT_PART_TIME_WEEK_MINUTES` | `attendance/hours-rule.ts:118` | Docblock says 27 h |
| `7.5/9` · `4.5/9` | `FULL_DAY_RATIO` · `HALF_DAY_RATIO` | `attendance/effective-config.ts:53` | |
| `50 min` | `LATE_GRACE_MINUTES` | `attendance/effective-config.ts:63` | Flat, not proportional to shift length |
| `10:00` / `19:00` | `FALLBACK_OFFICIAL_START/END` | `attendance/effective-config.ts:66` | |
| `10:50` / `19:20` / `9h` / `5h` | `companyDefaults` | `queries/attendance-status.ts:167` | Literal fallbacks if `org_settings` is null |
| `9 h` · `54 h` | `FULL_DAY_MINUTES` · `WEEK_TARGET_MINUTES` | `attendance/hours-rule.ts:24` | |
| `3` · `4` | `H1_ALLOWANCE` · `H2_ALLOWANCE` | `attendance/leave-cycle.ts:40` | Paid leaves per half-year |
| `2026-10-01` | `FY_RULE_FROM` | `attendance/leave-cycle.ts:51` | Leave-period rule changeover |
| `"2026-08"` / `"2026-07"` | *(inline literals)* | `salary/generate.ts:207-231` | The attendance-era branches |
| `"2026-08"` | *(inline literal)* | `queries/attendance-summary.ts` | Salary-lost cutoff, restated |
| `"2026-07"` | `SALARY_PUNCH_CUTOVER` | `salary/generate.ts:36` | **Unused** |
| `false` | `applyLate` | `salary/generate.ts:203` | Late deduction permanently off |
| `5 min` | `STALE_MS` | `salary/refresh-open-month.ts:44` | Open-month refresh throttle |
| `₹0.50` | `SETTLED_EPSILON` | `salary/payment.ts:52` | Payment settle tolerance |
| `₹3,500` · `30 h` · `₹0` | display defaults | `queries/salary.ts:100-103` | Substituted when the profile column is null |
| 4 names | `EXCLUDED_SHEET_NAMES` | `queries/salary-breakup.ts:22` | Ex-staff dropped from the register by normalised name |
| 2 emails | `SUPER_ADMIN_EMAILS` | `auth/super-admin.ts:8` | Gates wave-off, adjustment, notes |
| 2 emails | `HOLIDAY_ADMIN_EMAILS` | `hr/holiday-admins.ts:26` | Gates the calendar that sets every target |
| `"Asia/Kolkata"` | *(inline)* | `generate.ts`, `my-salary.ts`, ~6 others | Company timezone, restated per call site |
| `[3,4,3,4,3,4]` | `joinerLeaveAccrual` | `salary/config.ts:46` | Advance-salary pattern; only `proration.ts` consumes it, and that file is dead |

---

## 16 · One real employee, end to end

**Mishtie Kanani · August 2026 · `full_time`.** Every figure below is either read from production
or produced by running the repo's own pure functions over production data. Nothing was written.

| | |
|---|---|
| Worker type | `full_time` → `monthly_ctc` basis |
| Annual CTC | ₹2,64,000 → **₹22,000 / month** |
| Schedule | 10:30 – 19:30 → span 540 min = 9 h/day |
| Weekly off | `0` (Sunday) |
| Designation | Operations Consultant → not an intern → **PT ₹200** |
| Joined | 2026-04-01 · probation ends 2026-12-31 |
| Paying entity | *(none set)* |

### Resolved config — `resolveEffectiveConfig`

```
dailyTargetMinutes   540    (19:30 − 10:30, span-derived)
weeklyTargetMinutes  3240   (540 × 6)
fullDayMinutes       450    (540 × 7.5/9 → ≥7.5h is a full day)
halfDayMinutes       270    (540 × 4.5/9 → ≥4.5h is a half day)
lateAfter            10:50  (explicit override)
earlyBefore          19:30  (explicit override, clamped to official end)
waiverThreshold      3240   (= the weekly target)
```

### Calendar context

August 2026 has 31 days. Sundays: 2, 9, 16, 23, 30 → **5 weekly offs**. Holidays from the merged
calendar: **15 Aug — Independence Day** (Saturday) and **28 Aug — Rakshabandhan** (Friday). Leave
on file: one *unpaid* request for 27–31 Aug, status **cancelled** — therefore invisible to the
grader. No comp-off, no remote work, no advances, no prior disbursed run.

### The graded month

| Date | Day | In | Out | Code | Value | Worked | Flags |
|---|---|---|---|---|---:|---:|---|
| 01 | Sat | — | — | `A` | 0 | 0 | |
| 02 | Sun | — | — | `W/O` | 1 | 0 | |
| 03 | Mon | — | — | `A` | 0 | 0 | |
| 04 | Tue | — | — | `A` | 0 | 0 | |
| 05 | Wed | 11:02 | 19:48 | `P` | 1 | 526 | late |
| 06 | Thu | 07:30 | 19:33 | `P` | 1 | 723 | |
| 07 | Fri | 11:29 | 20:30 | `P` | 1 | 541 | late |
| 08 | Sat | 09:30 | 19:50 | `P` | 1 | 620 | |
| 09 | Sun | — | — | `W/O` | 1 | 0 | |
| 10 | Mon | 11:25 | 19:38 | `P` | 1 | 493 | late |
| 11 | Tue | 10:45 | 14:00 | `A` | 0 | 195 | early · admin correction |
| 12 | Wed | 13:13 | 19:55 | `H/D` | 0.5 | 402 | late |
| 13 | Thu | 07:30 | 20:17 | `P` | 1 | 767 | |
| 14 | Fri | 10:58 | 19:46 | `P` | 1 | 528 | late |
| 15 | Sat | — | — | `H` | 1 | 0 | Independence Day |
| 16 | Sun | — | — | `W/O` | 1 | 0 | |
| 17 | Mon | — | — | `A` | 0 | 0 | |
| 18 | Tue | 10:37 | 20:16 | `P` | 1 | 579 | |
| 19 | Wed | 10:48 | 21:31 | `P` | 1 | 643 | admin correction |
| 20 | Thu | 10:44 | 19:53 | `P` | 1 | 549 | |
| 21 | Fri | 10:41 | 19:48 | `P` | 1 | 547 | |
| 22 | Sat | 10:49 | 19:49 | `P` | 1 | 540 | |
| 23 | Sun | — | — | `W/O` | 1 | 0 | |
| 24 | Mon | 10:36 | 20:18 | `P` | 1 | 582 | |
| 25 | Tue | 11:04 | 20:25 | `P` | 1 | 561 | late |
| 26 | Wed | — | — | `A` | 0 | 0 | |
| 27 | Thu | 10:35 | 19:35 | `P` | 1 | 540 | admin correction |
| 28 | Fri | — | — | `H` | 1 | 0 | Rakshabandhan |
| 29 | Sat | 10:41 | 20:10 | `P` | 1 | 569 | admin correction |
| 30 | Sun | — | — | `W/O` | 1 | 0 | |
| 31 | Mon | — | — | `A` | 0 | 0 | |

**24 ordinary days** (16 `P` + 1 `H/D` + 7 `A`), 5 weekly offs, 2 holidays.

Note day 11: 3 h 15 m worked is below the 270-minute half-day floor, so a day she was demonstrably
present grades **Absent**.

### Weekly reconciliation

| Week (Mon) | Ordinary days | Target | Actual | Carry in | Effective target | Deficit | Closing |
|---|---:|---:|---:|---:|---:|---:|---:|
| 27 Jul | 1 | 540 | 0 | 0 | 540 | 540 | −540 |
| 03 Aug | 6 | 3240 | 2410 | −540 | 3780 | 1370 | −1370 |
| 10 Aug | 5 | 2700 | 2385 | −1370 | 4070 | 1685 | −1685 |
| 17 Aug | 6 | 3240 | 2858 | −1685 | 4925 | 2067 | −2067 |
| 24 Aug | 5 | 2700 | 2252 | −2067 | 4767 | 2515 | −2515 |
| 31 Aug | 1 | 540 | 0 | −2515 | 3055 | 3055 | −3055 |
| **Month** | **24** | **12,960** | **9,905** | — | — | — | **−3,055** |

No week reached its waiver bar, so the 12 Aug half-day was numbered ordinal 1 and **waived by the
3-per-month grace** — `chargeableHalfDays = 0`.

### Payable hours and pay — recomputed today

```
creditedMinutes    = 0            // no PL / CO / HP / H-H/D
targetMinutes      = 12960 + 0 = 12960   →  targetHours = 216.0
ordinaryPayable    = min(9905, 12960) = 9905
payableMinutesRaw  = 9905 + 0 = 9905
payableHours       = floor(9905 / 60) = 165
unpaidLeaveDays    = 0
netSurplusMinutes  = max(0, 9905 − 12960) = 0

hourlyRate = 22000 / 216                = ₹101.85
paidHours  = 165 − 0 − 0                = 165
base       = min(101.8518 × 165, 22000) = ₹16,805.56
overtime   = 0                          // full_time earns none
gross      = ₹16,805.56
pt         = ₹200                       // Operations Consultant, not exempt
tds        = ₹0 · advances ₹0 · pending ₹0
net        = ₹16,605.56
```

### What the three surfaces actually show

| Figure | Recomputed today | `salary_runs` (stored) | `salary_breakup` (stored) |
|---|---:|---:|---:|
| Target hours | 216 | **225** | — |
| Worked / payable hours | 165 | **191** | 191 |
| Hourly rate | ₹101.85 | **₹97.78** | — |
| Gross | ₹16,805.56 | **₹18,675.56** | ₹18,675.56 |
| **Net payable** | **₹16,605.56** | **₹18,475.56** | **₹18,475.56** |
| Present days | 16 | — | **12** |
| Half days | 1 | — | **5** |
| Absent days | 7 | — | 7 |

> **What My Salary renders for this month.**
> The card takes **money and hours from the stored run** (₹18,475.56 net, Required 225 h,
> Worked 191 h, Less Hours 34 h) and **day counts and calendar from a live re-grade** (16 present,
> 1 half day, 7 absent, 24 working days). The Accounts page, reading `salary_breakup`, shows the
> same money against **12 present and 5 half days**. Three surfaces, one month, three attendance
> pictures — and the **₹1,870 gap** between the stored gross and a fresh recompute is the size of
> the drift.
>
> The cause is structural, not a one-off: the stored run was last written on 31 Aug; the punches on
> 11, 19, 27 and 29 Aug carry `source='admin'` / `reason='correction'`, and `attendance_logs` has
> no `created_at`, so there is no way to date those edits. Once September opened,
> `refreshOpenMonthRun` stopped touching August — and nothing re-prices a closed month except a
> manual **Generate Salary**.

---

## 17 · Defects and inconsistencies

Ordered by how much money each can move. All observed in the current tree or in production data;
none were changed.

### 🔴 BLOCKING — The working tree does not compile: 26 files carry unresolved merge conflicts

`git status` reports an in-progress merge with `UU`/`AA` entries. `db/schema.ts:2078` and
`lib/attendance/mobile-devices.ts` contain literal `<<<<<<< HEAD` markers; `lib/auth/current.ts`
and `lib/db/dev-offline.ts` are also conflicted. esbuild fails on `db/schema.ts`, so anything
importing the schema — which is the entire salary engine — cannot build.

*No salary **math** file is conflicted:* `compute.ts`, `generate.ts`, `my-salary.ts`,
`hour-balance.ts`, `hours-rule.ts`, `effective-config.ts` and `attendance-status.ts` are all clean.

### 🔴 MONEY — A closed month's pay is frozen while the attendance beside it keeps moving

`refreshOpenMonthRun` returns `"not-open-month"` for anything but the current month, so once a
month closes its `salary_runs` row never updates again unless an admin re-runs Generate Salary.
Meanwhile `withRealAttendance` re-grades that same month on every My Salary view. Any punch
correction, holiday change or leave decision made after generation silently desynchronises the
payslip from the calendar printed beside it.

*Observed:* Mishtie Kanani, Aug 2026 — stored ₹18,675.56 gross vs ₹16,805.56 on a fresh recompute (§16).

### 🔴 MONEY — An uncapped hourly rate makes one profile field a single point of payroll failure

For an overtime-eligible worker, `gross = hourlyRate × workedHours` with **no cap at all** — the
monthly cap applies only to workers who earn no overtime. `hourlyMonthlyAnchor` takes
`monthly_pay_at_target` whenever it is > 0, ignoring CTC entirely. A mistyped anchor multiplies
straight into pay with nothing to arrest it.

*Production:* Daniel Sayyed (`second_half`, `annual_ctc` ₹72,000 → ₹6,000/month) carries
`monthly_pay_at_target = ₹35,000`. His August run paid **₹40,306.45** for 153 hours at ₹263.44/h.
Om Jadhav's anchor moved from ₹3,500 to ₹35,000 between the August and September runs, taking his
rate from ₹29.17 to ₹304.35/h — a 10× change with no audit trail on the run.

### 🔴 MONEY — The open month's target counts days that have not happened

`gradeMonth` grades every calendar day of the month, and an unpunched future working day becomes
`A` — an ordinary day carrying a full `dailyTargetMinutes` of target. `reconcileMonth` and
`payableHoursForMonth` apply **no elapsed-day filter** (unlike the KPI surfaces, which do). So
mid-month the run's `target_hours` covers the whole month while `payableHours` covers only elapsed days.

*Production:* every September 2026 run. Vinal Patil — 115 h target, 1 h worked, ₹30.43 net, on 10 September.

### 🔴 MONEY — Working on a holiday pays nothing under the hourly engine

`HP` and `H-H/D` are in `PAID_CREDITED_CODES`, so each adds `dailyTargetMinutes` to *both* target
and payable — they cancel. The hours actually worked that day are excluded from
`totalActualMinutes` because `HP` is not an ordinary day. The 2× and 1.5× premiums survive only in
`summary.payableDays` and in the legacy day-based path, so the payslip and the "Extra Days Worked"
line on My Salary describe different economics.

*Where:* `lib/attendance/hour-balance.ts:344` · `lib/attendance/hours-rule.ts:63`

### 🟡 DATA — An hourly shift can never earn a full day from its own scheduled window

For an hourly shift, `fullDayMinutes = halfDayMinutes = weeklyTarget / 6` and there is no half-day
tier — anything below the target is `A`. Daniel Sayyed's official window is 09:00–13:00 (4 h) but
his `weekly_target_minutes` is 1800 (30 h → 5 h/day), and his explicit `att_full_day_minutes` is
300. Working his entire scheduled window grades him **Absent**.

*Where:* `lib/attendance/effective-config.ts:246-256`

### 🟡 DATA — An inverted schedule span falls back silently

Mitul Mehta (`full_time`) has `att_official_start = 10:30` and `att_official_end = 07:30`. The span
is −180 minutes, so `resolveEffectiveConfig` falls through to the 9 h worker-type default and
`earlyBefore` becomes **07:30** — meaning no checkout can ever be early. Nothing validates that the
end follows the start.

*Also:* two `hybrid` rows carry a 03:00–20:00 window, and one full-timer has
`att_late_after = 22:50`, which makes lateness unreachable.

### 🟡 CONSISTENCY — Day counts and money in one `salary_breakup` row come from different moments

`syncBreakupFromApp` writes both the day columns and the money columns. `mirrorToBreakup` — which
runs on every throttled open-month refresh — writes **only the money columns**. A row therefore
ends up with money from the latest refresh and attendance counts from the last full sync.

*Observed:* Mishtie's Aug row carries `worked_hours = 191` and `final_payment = 18,475.56` from the
31 Aug refresh, beside `present = 12, half_day = 5` from an earlier sync that cannot reconcile with 191 h.

### 🟡 CONSISTENCY — The mobile API reads a different table than the web app

`/api/mobile/salary` serves `salary_breakup` only. My Salary serves `salary_runs` with a live
refresh on top. For the open month — the one an employee checks most — the two are guaranteed to
differ until a sync runs.

*Where:* `app/api/mobile/salary/route.ts:76`

### 🟡 CORRECTNESS — The declared "canonical" hourly rate is not the one that pays

`calendarHourlyRate`'s docblock states that "every surface that shows or spends a shift-worker's
rate — payroll (computeHourlySalary), the Monday week-loss pricing, the admin profile dialog's
preview — must call this". `computeHourlySalary` does not call it; it divides by the eligible
target instead. So the Monday week-loss dialog prices a shortfall at a rate the payslip will not
use, and the two diverge exactly when a month contains a holiday.

*Where:* `lib/salary/compute.ts:96-112` vs `:150-163`

### 🟡 CORRECTNESS — `salary_profiles.pt_exempt` is stored, editable, and never read

The Admin Panel writes it and `listSalaryProfiles` selects it, but `assembleMonthInputs` computes
`ptExempt` from `isPtExempt()` — two hardcoded UUIDs plus an "intern" substring match — and never
consults the column. Nine of twenty `monthly_ctc` profiles have the flag set; for seventeen of them
it does nothing.

*Where:* `lib/salary/generate.ts:246` · `lib/salary/pt-policy.ts`

### 🟡 CORRECTNESS — A present-but-short day grades Absent, not Half Day

The three-tier rule floors at `halfDayMinutes`. Below it the code is `A` with day value 0 even
though there are punches. On Mishtie's 11 Aug she was in from 10:45 to 14:00 — 3 h 15 m of recorded
work — and the day is Absent. The worked minutes still count toward the hour balance, so it is not
a double charge, but every day-count surface reports her absent on a day she attended.

*Where:* `lib/attendance/status.ts:158`

### 🟡 SCHEMA — `attendance_audit_log` is declared in the schema and does not exist in the database

`db/schema.ts:2145` declares the table with 19 columns. `information_schema` confirms it is absent
from the live database. Any code path that writes it will fail at runtime.

*Related:* `attendance_logs` has no `created_at` or `updated_at`, so a punch correction leaves no
timestamp — which is why the §16 drift cannot be dated.

### ⚪ UI — The Generate Salary button promises the opposite of what it does

Its confirm dialog reads *"Existing runs are never overwritten"* and it calls `generateSalary`,
which upserts and **recomputes every non-disbursement column** for every employee. The
non-clobbering behaviour belongs to `generateSalaryAll`, which the button does not call. Any manual
`editRun` adjustment to advances or pending balance is also silently discarded by the same upsert.

*Where:* `components/attendance/dashboard/generate-salary-button.tsx:23`

### ⚪ PERFORMANCE — Generate Salary grades the whole roster three times and queries per employee in a loop

`assembleMonthInputs` runs one full roster grading pass; `syncBreakupFromApp` runs a second and
calls `assembleMonthInputs` again for a third. Inside the assembler, `sumAdvances` and
`lastDisbursedRemainder` are awaited per employee — 50 sequential round-trips for a 25-person org.
My Salary pays the same assembler cost on every page view outside the 5-minute throttle.

### ⚪ HYGIENE — Stale documentation contradicts live constants

Docblocks in `worker-type.ts`, `compute.ts` and `schedule-format.ts` describe the hourly shift as
"4.5 h day, 27 h week". The constants are 5 h and 30 h, and all five live hourly rows store 1800
minutes. `SALARY_PUNCH_CUTOVER` is exported and unused. `lib/salary/proration.ts` has no importers.
`salary_config` is fully populated and read by nothing on the pay path.

### ⚪ ACCESS — Two email addresses control every employee's target hours

`HOLIDAY_ADMIN_EMAILS` gates the holiday calendar, and the calendar is the denominator of every
hourly rate. The list is narrower than admin and narrower than super-admin by design, and it is
keyed by email string with no break-glass path. If neither address is reachable, no holiday can be
declared or withdrawn.

---

## 18 · Source of truth, per quantity

When two numbers disagree, this table says which one the payslip will honour.

| Quantity | Authoritative implementation | Persisted where |
|---|---|---|
| Employee schedule & targets | `resolveEffectiveConfig` | Derived per call; never stored |
| Day code & day value | `computeDayCode` | Derived per call; never stored |
| Weekly target & carry | `reconcileMonth` | Derived; the balance dies at month end |
| Target hours | `payableHoursForMonth().targetHours` | `salary_runs.target_hours` (frozen at issue) |
| Payable hours | `payableHoursForMonth().payableMinutesRaw` | `salary_runs.worked_hours` (post-penalty) |
| Attendance day counts | `payableDaysByHours` (summary) / live re-grade (My Salary) | `salary_breakup.present/absent/half_day` |
| Hourly rate — `full_time` | `computeScheduleHourlySalary` | `salary_runs.hourly_rate` |
| Hourly rate — shifts | `computeHourlySalary` | `salary_runs.hourly_rate` |
| Gross & net | `computeForRow` | `salary_runs.gross` / `net_payable` |
| Professional tax | `isPtExempt` + `PT_AMOUNT` in `compute.ts` | `salary_runs.pt` |
| Advances | `sumAdvances` | `salary_advances` → `salary_runs.advances` |
| Carry-forward | `lastDisbursedRemainder` | `salary_runs.pending_balance_in` |
| **Amount to actually pay** | `netAfterWaiveOff` / `totalPayable` | Derived from `salary_breakup`; never stored |
| Payment state | `paymentStatusOf` | `salary_breakup.amount_paid` + `.paid` |
| Holiday calendar | `listHolidayDateSet` | Union of 3 sources, minus inactive rows |
| Leave entitlement | `leaveCycleFor` + `proRataAllowance` | Derived from `probation_end` |
| Who is paid how | `payBasisFor(employees.worker_type)` | `salary_runs.pay_type` (denormalised copy) |

---

### The one-sentence version

> Since August 2026 every employee is paid **hours × (monthly figure ÷ schedule-derived target
> hours)**, where the target already excludes weekly offs, holidays and approved leave, payable
> hours are clamped at the month's requirement and floored to a whole hour, unpaid leave and the
> fourth-and-later half-day are charged at that same rate, and only the three hourly shift types
> are paid for anything beyond the target.

---

*Audit performed 10 Sep 2026 against branch head `9963b8d` (mid-merge) and the production Supabase
database via read-only `SELECT`s. No file in the repository was created, modified or deleted apart
from this document; no row in the database was written.*
