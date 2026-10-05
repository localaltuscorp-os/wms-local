# Salary, Pay, Tax and Financial Lineage Audit

## Purpose

This document records the Salary Financial Lineage implementation and existing WMS salary architecture it exposes.

The lineage workspace is read-only. It does not replace salary calculation, create a second payroll system, or create artificial Accounts or Asset relationships.

It lets an administrator inspect, for an employee and salary period:

- CTC source.
- Salary profile configuration.
- CTC breakup components.
- Payroll run that produced gross salary, deductions, and net pay.
- TDS, Professional Tax, advances, and pending-balance effects.
- Salary-breakup register mirror.
- Payment, reimbursement, and asset records connected to the employee.
- Existing salary audit events.
- Relationships that do not exist in the current schema.

## Admin location

Navigation:

    Admin Panel > People > Salary Lineage

Route:

    /admin/salary-lineage

Query parameters:

    /admin/salary-lineage?employee=<employee-id>&month=YYYY-MM

The page requires existing Admin access through \`requireAdmin()\`.

## Source-of-truth map

| Value | Source | Field | Usage |
|---|---|---|---|
| Employee identity | \`employees\` | \`id\`, \`name\`, \`email\` | Links salary records |
| Annual CTC | \`salary_profiles\` | \`annual_ctc\` | Current salary profile and payroll input |
| Monthly CTC | Derived from \`salary_profiles.annual_ctc\` | \`annual_ctc / 12\` | Monthly salary reference |
| Frozen rate root | \`salary_runs\` | \`monthly_salary\`, \`per_day_salary\`, \`working_hours_per_day\` | Exact generated-run calculation inputs; historical rows remain null |
| TDS configuration | \`salary_profiles\` | \`tds_monthly\` | Salary-engine input |
| PT exemption | \`salary_profiles\` | \`pt_exempt\` | PT policy input |
| Pay basis | \`employees.worker_type\` and profile fields | Worker type and pay fields | Selects calculation path |
| CTC components | \`salary_ctc_breakup\` | \`components\` JSONB | Component-level CTC |
| Gross salary | \`salary_runs\` | \`gross\` | Payroll-period gross result |
| Professional Tax | \`salary_runs\` | \`pt\` | Payroll-period PT deduction |
| TDS deduction | \`salary_runs\` | \`tds\` | Payroll-period TDS deduction |
| Salary advance | \`salary_advances\`, \`salary_runs\` | \`amount\`, \`advances\` | Advance deduction |
| Pending balance | \`salary_runs\` | \`pending_balance_in\` | Carry-forward amount |
| Net payable | \`salary_runs\` | \`net_payable\` | Canonical payroll result |
| Salary register mirror | \`salary_breakup\` | \`final_payment\`, \`payable_after_leave\`, \`payable_after_pt\` | Accounts-facing register |
| Salary payments | \`salary_payments\` | \`amount\`, \`salary_run_id\`, \`paid_date\` | Payment ledger where present |
| Reimbursements | \`module_submissions\` | Reimbursement fields and admin fields | Existing reimbursement connection |
| Employee assets | \`hr_assets\` | \`issued_employee_id\` | Employee-to-asset relation |
| Salary audit | \`employee_events\` | \`event_type\`, \`from_value\`, \`to_value\` | Existing change history |

## Existing calculation architecture

The existing salary engine uses:

- \`lib/salary/compute.ts\`
- \`lib/salary/generate.ts\`
- \`lib/salary/period.ts\`
- \`lib/salary/pt-policy.ts\`
- \`lib/salary/breakup-from-app.ts\`
- \`lib/salary/breakup-sync.ts\`
- \`lib/salary/reimbursement-earnings.ts\`
- \`lib/queries/salary.ts\`
- \`lib/queries/salary-breakup.ts\`
- \`app/(app)/salary/actions.ts\`

The lineage view does not recalculate stored payroll values. It displays stored results and identifies existing engine relationships.

## Pay-basis rules

### Monthly CTC

Existing legacy calculation:

    monthly CTC = annual CTC / 12
    per-day salary = monthly CTC / days in month
    late deduction days = floor(late marks / 3) × 0.5
    effective days = payable days − late deduction days
    gross = per-day salary × effective days
    PT = 0 when PT-exempt, otherwise existing PT amount/policy
    net = gross − PT − TDS − advances + pending balance in

Schedule-based payroll months can use payable day values and schedule hours through the existing engine.

### Hourly

Existing hourly calculation uses monthly target, weekly target hours, worked minutes, eligible target hours, and overtime rules.

Stored hourly lineage fields include:

- \`worked_hours\`
- \`target_hours\`
- \`hourly_rate\`
- \`overtime_hours\`
- \`overtime_amount\`

### Fixed fee

Existing fixed-fee calculation uses configured monthly fee and existing deductions. No new fixed-fee formula was introduced.

## Payroll data flow

    Employee
      -> salary_profiles
      -> attendance and payroll inputs
      -> existing salary engine
      -> salary_runs
      -> salary_breakup mirror
      -> salary payments, payslip, and Accounts-facing salary view

Attendance inputs can include attendance logs, employee schedule configuration, holidays, approved leave, comp-off credits, and historical attendance-sheet data. Existing period cutover rules decide the source.

## Tax lineage

### TDS

Configured monthly TDS:

    salary_profiles.tds_monthly

Period-specific stored TDS:

    salary_runs.tds

No separate taxable-income table or tax-calculation ledger was found. The UI reports this instead of inventing one.

### Professional Tax

Period-specific PT:

    salary_runs.pt

PT uses existing PT exemption policy and pay-engine behavior.

### Net pay

Where a canonical run exists:

    net_payable = gross - pt - tds - advances + pending_balance_in

The workspace displays this relationship without overwriting the stored amount.

## Salary breakup lineage

\`salary_ctc_breakup\` stores:

- Employee ID.
- Annual CTC.
- Component list in JSONB.
- Updating employee ID.
- Updated timestamp.

\`salary_profiles.annual_ctc\` remains salary-engine authority. \`salary_ctc_breakup\` is component data, not a second payroll CTC source.

The page shows stored annual CTC, component labels, annual values, and breakup update time. Missing breakup rows are shown explicitly.

## Salary-run lineage

When a \`salary_runs\` row exists, the page shows:

- Run ID and period.
- Annual CTC.
- Payable days.
- Pay type.
- Worked hours.
- Target hours.
- Hourly rate.
- Overtime hours and amount.
- Gross.
- PT.
- TDS.
- Advances.
- Pending balance in.
- Net payable.
- Source.
- Creation time.
- Disbursed state and amount.

If no run exists, the page states that no stored calculation trace can be claimed.

## Salary-register lineage

When a \`salary_breakup\` row exists, the page shows:

- Monthly CTC.
- Payable after leave.
- PT.
- Payable after PT.
- Advance.
- Previous pending.
- Final payment.
- Salary given.
- Amount paid.
- Paid flag.

The page distinguishes this Accounts-facing mirror from the canonical salary run.

## Forward connections

### Payroll

A selected \`salary_runs\` row is shown as the direct payroll connection.

### Accounts

A selected \`salary_breakup\` row is shown as the existing Accounts-facing salary register.

No direct salary-to-general-ledger or account-entry foreign key was found. The page states:

    No direct salary-to-ledger/account-entry relation found in current schema.

### Salary payments

The page reads existing \`salary_payments\` records for employee and period. It displays amount, paid date, method, note, and kind. It never creates payment records.

### Reimbursements

Reimbursements are stored in \`module_submissions\`, not a dedicated reimbursement table. Existing reader:

    lib/salary/reimbursement-earnings.ts

The page displays reimbursement record count and paid-this-month amount. It does not claim reimbursement inclusion in net pay unless existing code establishes it.

### Assets

The genuine employee relation is:

    hr_assets.issued_employee_id

The page lists linked HR assets when present.

The current schema has no salary deduction, asset recovery, liability, or payroll-adjustment relation. Therefore the page states either:

    No salary deduction or recovery link found.

or:

    No direct connection found.

## Change tracking

The page reads existing \`employee_events\` records where:

    event_type = salary_profile_set

It exposes event type, timestamp, previous value, new value, and note.

No synthetic history is created.

## UI structure

The workspace contains:

### Salary Overview

Expandable CTC, gross, deductions, and net-pay values. Each value includes source and formula details.

### Salary Profile and Breakup

Shows profile configuration and stored component-level CTC data.

### Calculation Trace

Shows stored payroll inputs and outputs.

### Tax and Deductions

Shows TDS, PT, deduction sources, and known formula relationships.

### Attendance and Advances

Shows payable days and selected-period advances.

### Forward Connections

Shows Payroll, Accounts, Payments, Reimbursements, Assets, and Accounting Ledger connections.

### Change History

Shows existing salary profile audit events in expandable rows.

The UI reuses existing Admin borders, spacing, typography, controls, and colors. No gradients, decorative visual system, new salary calculations, or new navigation system was added.

## Implementation files

New:

- \`app/(admin)/admin/salary-lineage/page.tsx\`
- \`components/admin/salary-lineage-view.tsx\`
- \`lib/queries/salary-lineage.ts\`

Updated:

- \`components/admin/admin-nav-config.ts\`

## Database impact

- Migration \`0260_salary_rate_root.sql\` adds nullable frozen calculation-root fields to \`salary_runs\`.
- Historical runs are not backfilled or repriced.
- Newly generated runs store monthly salary, per-day salary, and the Employee Master daily-hours input.
- Existing salary write authorization remains unchanged.

## Security

The route uses existing Admin authorization through \`requireAdmin()\`.

The feature has no write actions. Existing salary write actions retain their current server-side authorization.

## Validation

Passed:

- ESLint for new and modified lineage files.
- Salary unit tests: 30 tests passed.
- \`git diff --check\`.

Full TypeScript validation did not complete within the command-runner limit and produced no diagnostic output.

## Known limits

The current system does not provide every requested financial relationship as a database relation. The UI reports limits rather than fabricating lineage:

- No separate taxable-income table found.
- No general-ledger salary-entry relation found.
- No salary deduction or recovery relation from HR assets found.
- Salary history exists only where employee audit events exist.
- CTC history is not period-versioned; current \`salary_profiles.annual_ctc\` is active source.
- A period without \`salary_runs\` has no stored calculation trace.

## Related audit

\`SALARY_AUDIT.md\` contains the broader read-only salary-engine audit, including salary tables, attendance sources, calculation functions, payroll routes, historical-period behavior, and known inconsistencies.

This file records the lineage feature, source mapping, UI behavior, limitations, and validation status.
+
# Second Pass: Deep Salary and Tax Calculation Root Audit

This section records the second-pass audit. It traces actual functions, formulas, inputs, intermediate values, stored outputs, and downstream relationships. This pass changed no application code, database schema, or production data.

## Audit scope

Inspected:

- \`lib/salary/compute.ts\`
- \`lib/salary/generate.ts\`
- \`lib/salary/period.ts\`
- \`lib/salary/pt-policy.ts\`
- \`lib/salary/breakup-from-app.ts\`
- \`lib/salary/breakup-sync.ts\`
- \`lib/salary/reimbursement-earnings.ts\`
- \`lib/queries/salary.ts\`
- \`lib/queries/salary-breakup.ts\`
- \`app/(app)/salary/actions.ts\`
- \`lib/salary/payment.ts\`
- \`lib/attendance/worker-type.ts\`
- \`lib/attendance/status.ts\`
- \`lib/attendance/hour-balance.ts\`
- \`lib/attendance/payroll-month.ts\`
- \`db/schema.ts\`
- Salary and Accounts readers that consume \`salary_breakup\` and \`salary_payments\`.

# A. SOURCE OF TRUTH

## Employee and profile roots

### Employee

Source:

    employees

Fields used:

- \`employees.id\`
- \`employees.name\`
- \`employees.worker_type\`
- \`employees.joined_at\`
- Schedule fields resolved by attendance configuration.
- \`employees.is_active\`
- Designation and paying-entity foreign keys.

Query:

    listSalaryProfiles() in lib/queries/salary.ts

The query left-joins \`salary_profiles\`, \`designations\`, and \`paying_entities\`. Active employees without a salary profile remain visible with zero salary values.

### Salary profile

Source:

    salary_profiles

Fields:

- \`annual_ctc\`
- \`tds_monthly\`
- \`pt_exempt\`
- \`pay_type\`
- \`monthly_pay_at_target\`
- \`weekly_target_hours\`
- \`monthly_fee\`

Important result:

    salary_profiles.annual_ctc is current salary-engine CTC authority.

No CTC history table exists. A historical month does not automatically resolve the historical CTC profile that existed at that time.

### Component breakup

Source:

    salary_ctc_breakup

Fields:

- \`employee_id\`
- \`annual_ctc\`
- \`components\`
- \`updated_by_id\`
- \`updated_at\`

This is component data. It is not the salary engine's CTC authority. The salary engine uses \`salary_profiles.annual_ctc\`.

## Period roots

### Month

Canonical month format:

    YYYY-MM

Function:

    daysInMonth(month) in lib/salary/period.ts

Formula:

    new Date(Date.UTC(year, month, 0)).getUTCDate()

Result:

- January: 31
- February: 28 or 29
- April, June, September, November: 30
- Other months: 31

No universal 30-day or 31-day assumption exists in the current calculation functions.

### Financial year

Function:

    fyForMonth(month)

Formula:

    April to December: FY <year>-<year+1>
    January to March: FY <year-1>-<year>

Example:

    2026-04 -> FY 26-27

### Company timezone

Constant:

    SALARY_TZ = "Asia/Kolkata"

Function:

    todayKeyOf(now)

The function produces the current salary date in IST. Open-month attendance and payroll calculations use this date boundary.

## Attendance roots

### Raw attendance

Source:

    attendance_logs

The attendance query folds punches into daily in/out data. It then passes daily punch data, schedule, leave, holidays, and comp-off context into:

    computeDayCode() in lib/attendance/status.ts

### Daily schedule

The effective schedule resolves employee-specific and organization fallback values, including:

- Daily target minutes.
- Weekly target minutes.
- Full-day threshold.
- Half-day threshold.
- Late-after time.
- Early-before time.
- Working days per week.

The schedule is resolved before day grading. Salary does not read raw punches directly.

### Daily day codes

Function:

    computeDayCode()

Inputs:

- In punch.
- Out punch.
- Employee schedule.
- Weekly-off flag.
- Holiday flag.
- Approved leave type.
- Half-day leave flag.
- Redeemed comp-off flag.
- Auto-closed punch flag.
- Reference time.

Outputs:

- Attendance code.
- Day value.
- Worked minutes.
- Late flag.
- Early-leave flag.
- Late-waived flag.

Relevant day values:

| Code | Value | Meaning |
|---|---:|---|
| \`P\` | 1.0 | Full day |
| \`H/D\` | 0.5 | Half day |
| \`A\` | 0 | Absent |
| \`W/O\` | 1.0 | Weekly off |
| \`H\` | 1.0 | Holiday |
| \`PL\` | 1.0 | Paid leave |
| \`LWP\` | 0 | Unpaid leave |
| \`CO\` | 1.0 | Redeemed comp-off |
| \`HP\` | 2.0 | Worked holiday or weekly off |
| \`H-H/D\` | 1.5 | Worked half-day on holiday or weekly off |

Precedence:

1. Half-day approved leave.
2. Full-day paid leave.
3. Full-day unpaid leave.
4. Redeemed comp-off.
5. Holiday or weekly-off work.
6. Ordinary punch grading.
7. Missing-punch handling.

Ordinary punch thresholds:

    worked >= fullDayMinutes -> P, value 1
    worked >= halfDayMinutes -> H/D, value 0.5
    worked < halfDayMinutes -> A, value 0

Late and early flags remain visible. Current hours-payroll generation sets:

    const applyLate = false

Therefore late marks are stored/displayed but do not add a second salary deduction in current generated payroll. The day code and worked-hours result already reflect the attendance effect.

## Attendance month source selection

Function:

    assembleMonthInputs(month) in lib/salary/generate.ts

Source selection:

| Period | Attendance source | Salary behavior |
|---|---|---|
| Before 2026-07 | \`getAttendanceSheetPayableMap()\` | Frozen HR-sheet payable days; legacy day calculation |
| 2026-07 | \`getMonthDashboardMerged()\` | Merged locked-sheet and app-graded data |
| 2026-08 | \`getAttendanceSheetPayableMap()\` | Frozen historical salary behavior |
| 2026-09 onward | \`getMonthDashboard()\` | App punch grader and new calendar-day / hourly payroll model |

The constant \`SALARY_PUNCH_CUTOVER = "2026-07"\` describes punch-source history. The hours-payroll gate is separately:

    PAYROLL_HOURS_FROM = "2026-09"

## Attendance transformation

For app-graded months:

    attendance_logs
      -> daily punches
      -> computeDayCode()
      -> graded day list
      -> reconcileMonth()
      -> payableHoursForMonth()
      -> payrollMonthFor()
      -> getMonthDashboard()
      -> assembleMonthInputs()
      -> computeForRow()
      -> salary_runs

For frozen months:

    attendance_sheet_month.total_days_worked
      -> getAttendanceSheetPayableMap()
      -> MonthInputRow.input.payableDays
      -> computeSalary()

# B. CALCULATION LINEAGE

## 1. Worker type and pay basis

Function:

    payBasisFor(workerType) in lib/attendance/worker-type.ts

Rules:

    full_time       -> monthly_ctc
    project_remote  -> fixed_fee
    first_half      -> hourly
    second_half     -> hourly
    hybrid          -> hourly

Worker type normalization:

    asWorkerType()

Unknown values default to \`full_time\`, except known legacy values:

    afternoon_shift -> second_half
    part_time       -> hybrid

Hourly monthly anchor:

    hourlyMonthlyAnchor({ annualCtc, monthlyPayAtTarget })

Formula:

    if monthlyPayAtTarget > 0:
        anchor = monthlyPayAtTarget
    else:
        anchor = annualCtc / 12

This fallback preserves older records that stored hourly salary in annual CTC.

## 2. Legacy monthly CTC path

Function:

    computeSalary(input) in lib/salary/compute.ts

Source inputs:

- \`annualCtc\`: \`salary_profiles.annual_ctc\`
- \`payableDays\`: attendance-sheet payable days or merged attendance summary
- \`daysInMonth\`: \`daysInMonth(month)\`
- \`ptExempt\`: generated by \`isPtExempt()\`
- \`tdsMonthly\`: \`salary_profiles.tds_monthly\`
- \`lateMarksInMonth\`: currently zeroed by \`applyLate = false\`
- \`advances\`: \`sumAdvances()\`
- \`pendingBalanceIn\`: \`lastDisbursedRemainder()\`

Exact formula:

    monthlyCtc = round2(annualCtc / 12)
    perDay = monthlyCtc / daysInMonth
    lateDeductionDays = floor(lateMarksInMonth / 3) * 0.5
    effectiveDays = payableDays - lateDeductionDays
    gross = round2(perDay * effectiveDays)
    pt = ptExempt ? 0 : 200
    net = round2(gross - pt - tdsMonthly - advances + pendingBalanceIn)

Rounding:

    round2(n) = Math.round((n + Number.EPSILON) * 100) / 100

Returned intermediate values:

- \`monthlyCtc\`
- \`perDay\`
- \`payableDays\`
- \`lateDeductionDays\`
- \`effectiveDays\`
- \`gross\`
- \`pt\`
- \`tds\`
- \`advances\`
- \`pendingBalanceIn\`
- \`net\`

Final storage:

- \`salary_runs.gross\`
- \`salary_runs.pt\`
- \`salary_runs.tds\`
- \`salary_runs.advances\`
- \`salary_runs.pending_balance_in\`
- \`salary_runs.net_payable\`

## 3. Current full-time app-graded path

Function:

    computeDailySalary()

Dispatcher:

    computeForRow() in lib/salary/generate.ts

Condition:

    r.payroll exists
    and r.payBasis === "monthly_ctc"

Inputs:

- \`monthlySalary = annualCtc / 12\`
- \`daysInMonth\`
- \`payableDayValue\`
- PT flag.
- TDS.
- Advances.
- Pending balance.
- Worked hours and target hours for display only.

Exact formula:

    monthlyCtc = round2(monthlySalary)
    perDayExact = monthlySalary / daysInMonth
    payableDays = max(0, payableDayValue)
    gross = round2(perDayExact * payableDays)
    pt = ptExempt ? 0 : 200
    net = round2(gross - pt - tdsMonthly - advances + pendingBalanceIn)

Important:

- Calendar days are the divisor.
- Weekly offs and holidays have day value 1.
- Paid leave has day value 1.
- Comp-off has day value 1.
- Holiday work has day value 2.
- Holiday half-day has day value 1.5.
- Absence has day value 0.
- LWP has day value 0.
- Hours are carried for display but do not multiply full-time pay.
- Full-time overtime is not cash. Surplus balances later weekly targets.

## 4. Hourly path

Function:

    computeHourlySalary()

Dispatcher condition:

    payBasis === "hourly"

Inputs:

- Monthly pay anchor.
- Weekly target hours.
- Calendar days in month.
- Worked minutes.
- Eligible target hours, when valid.
- Attendance required-hours threshold fallback.
- Overtime eligibility.
- PT flag.
- TDS.
- Advances.
- Pending balance.

Calendar target:

    calendarTarget = weeklyTargetHours * (daysInMonth / 7)

Eligible target selection:

    eligibleTargetHours is accepted only when:
      eligibleTargetHours > 0
      and eligibleTargetHours >= calendarTarget * 0.5

Otherwise:

    rateTargetHours = calendarTarget

Hourly rate:

    hourlyRate = monthlyPayAtTarget / rateTargetHours

Worked hours:

    workedHours = floor(workedMinutes / 60)

Expected hours:

    expectedHours = eligibleTargetHours
                 ?? overtimeThresholdHours
                 ?? rateTargetHours

Overtime:

    overtimeHours =
      overtimeEligible
        ? max(0, workedHours - expectedHours)
        : 0

Overtime amount:

    overtimeAmount = round2(hourlyRate * overtimeHours)

Gross when overtime is eligible:

    gross = round2(hourlyRate * workedHours)

Gross when overtime is not eligible:

    gross = round2(min(hourlyRate * workedHours, monthlyPayAtTarget))

Net:

    net = round2(gross - pt - tdsMonthly - advances + pendingBalanceIn)

The returned \`workedHours\` in this function represents whole paid hours, not precise raw minutes.

The dispatcher sets overtime eligibility from:

    earnsOvertime(workerType)

Current rule:

- First-half and second-half shifts earn overtime.
- Hybrid hourly shifts earn overtime.
- Full-time does not earn cash overtime.
- Project/remote is not hourly.

## 5. Fixed-fee path

Function:

    computeFixedFeeSalary()

Inputs:

- \`monthlyFee\`
- \`tdsMonthly\`
- \`advances\`
- \`pendingBalanceIn\`

Formula:

    gross = round2(monthlyFee)
    pt = 0
    net = round2(gross - tdsMonthly - advances + pendingBalanceIn)

Attendance does not change fixed-fee gross. PT is hardcoded zero in this function.

## 6. Schedule-hourly legacy/current support path

Function:

    computeScheduleHourlySalary()

This function remains used by schedule-hourly surfaces and historical/secondary payroll paths.

Inputs:

- Monthly salary.
- Monthly target hours.
- Raw payable hours.
- Chargeable half-days.
- Daily target hours.
- Approved unpaid-leave days.
- Overtime hours.
- PT flag.
- TDS.
- Advances.
- Pending balance.

Formula:

    hourlyRate = monthlySalary / monthlyTargetHours
    payableHours = max(0, floor(payableHoursRaw))
    halfDayPenaltyHours = chargeableHalfDays * (dailyTargetHours / 2)
    unpaidLeaveHours = max(0, unpaidLeaveDays) * dailyTargetHours
    paidHours = max(0, payableHours - halfDayPenaltyHours - unpaidLeaveHours)
    base = min(hourlyRate * paidHours, monthlySalary)
    overtimeAmount = round2(hourlyRate * overtimeHours)
    gross = round2(base + overtimeAmount)
    net = round2(gross - pt - tdsMonthly - advances + pendingBalanceIn)

This path charges approved unpaid leave once. Paid leave is credited before this function and does not become a deduction.

## 7. Attendance hours reconciliation

Function:

    reconcileMonth() in lib/attendance/hour-balance.ts

Inputs:

- Graded days.
- Month.
- Weekly target minutes.
- Waiver threshold minutes.
- Working days per week.
- Reference date.

Per week:

    ordinary days = P, H/D, A days
    expected days = count(ordinary days)
    target minutes = round(weeklyTargetMinutes * expectedDays / workingDaysPerWeek)
    actual minutes = all worked minutes in week
    carry-in = previous signed balance
    effective target = max(0, target - carry-in)
    net = actual minutes - target
    balance = carry-in + net

The function carries surplus forward and uses it against later short weeks.

Half-day handling:

- The first three qualifying half-days are waived by existing grace rules.
- Later chargeable half-days reduce payable hours or day value through the existing payroll path.
- The salary engine does not invent a second independent half-day rule.

Function:

    payableHoursForMonth()

Formula:

    ordinaryPayable = min(totalActualMinutes, totalTargetMinutes)

Credited minutes:

- Paid leave: daily target minutes.
- Comp-off: daily target minutes.
- Holiday: represented by graded day logic.
- Holiday work: represented by graded day logic.

Then:

    targetMinutes = totalTargetMinutes + creditedMinutes
    payableMinutesRaw = ordinaryPayable + creditedMinutes
    payableHours = floor(payableMinutesRaw / 60)
    netSurplusMinutes = max(0, totalActualMinutes - totalTargetMinutes)

Approved LWP is not credited. It is carried as \`unpaidLeaveDays\` and charged by \`computeScheduleHourlySalary\` where that path applies.

## 8. Payable day value

Function:

    payableDayValue(days, refTodayISO)

Formula:

    sum(dayValue for days where logDate <= refTodayISO)

Then:

    rounded total = round(total * 2) / 2

This value enters \`computeDailySalary.payableDayValue\` for current full-time payroll.

## 9. Salary input assembly

Function:

    assembleMonthInputs(month)

For each active employee:

1. Read salary profile.
2. Select attendance source based on month.
3. Read advances using \`sumAdvances(employeeId, month)\`.
4. Read carry-forward using \`lastDisbursedRemainder(employeeId, month)\`.
5. Resolve pay basis from worker type.
6. Resolve PT exemption using \`isPtExempt()\` except hourly workers, which are marked PT-exempt in this assembly path.
7. Build \`MonthInputRow\`.
8. Skip persistence later when \`hasProfile\` is false.

Profile sufficiency:

    hourly: hourly anchor > 0
    fixed_fee: monthly fee > 0
    monthly_ctc: annual CTC > 0

## 10. Dispatcher

Function:

    computeForRow(row)

Order:

1. Hourly path if \`payBasis === "hourly"\`.
2. Current full-time daily path if \`payroll\` exists and \`payBasis === "monthly_ctc"\`.
3. Fixed-fee path if \`payBasis === "fixed_fee"\`.
4. Legacy \`computeSalary()\` fallback.

This order matters. Current app-graded full-time payroll does not use \`computeScheduleHourlySalary()\` or legacy \`computeSalary()\`; it uses \`computeDailySalary()\`.

# Tax and PT root audit

## TDS

Source field:

    salary_profiles.tds_monthly

Read by:

    listSalaryProfiles()
    assembleMonthInputs()
    computeForRow()
    computeSalary()
    computeHourlySalary()
    computeFixedFeeSalary()
    computeDailySalary()
    computeScheduleHourlySalary()

Storage:

    salary_runs.tds
    salary_breakup does not create a separate tax calculation

Actual behavior:

    TDS is a manually configured monthly amount.

No code was found that calculates TDS from:

- Annual taxable income.
- Tax slabs.
- Tax regime.
- Exemptions.
- Investments.
- Section-based deductions.
- Taxable component classification.
- Annual tax projection.

Therefore:

    NO TAX-SLAB CALCULATION FOUND.

    NO TAXABLE-INCOME CALCULATION FOUND.

    TDS IS A STORED MONTHLY PROFILE AMOUNT USED AS A PAYROLL DEDUCTION.

TDS enters net pay only through subtraction:

    net = gross - pt - tds - advances + pendingBalanceIn

TDS is stored on \`salary_runs.tds\`. No direct general-ledger TDS payable relation exists in the inspected schema.

## Professional Tax

Policy file:

    lib/salary/pt-policy.ts

Constant:

    PT_AMOUNT = 200

Exemptions:

1. Employee ID \`c2209647-892b-4c4f-8e93-ad46500c5912\`.
2. Employee ID \`83e8fcd8-454c-41c7-93b9-5ea80737c8ae\`.
3. Designation name containing \`intern\`, case-insensitive and trimmed.

Function:

    isPtExempt({ employeeId, designationName })

The policy file comments state that \`salary_profiles.pt_exempt\` is not consulted by this policy. However, the salary profile query still exposes \`ptExempt\`, and some UI/profile structures carry the field. The generated payroll path uses \`isPtExempt()\` for non-hourly workers and forces hourly workers to PT-exempt.

Calculation in monthly, hourly, and daily functions:

    pt = ptExempt ? 0 : 200

Fixed-fee function:

    pt = 0

Storage:

    salary_runs.pt
    salary_breakup.pt

Net-pay impact:

    net = gross - pt - tds - advances + pendingBalanceIn

## Deductions

### TDS

- Source: \`salary_profiles.tds_monthly\`.
- Function: passed through \`assembleMonthInputs()\` into compute functions.
- Formula: fixed subtraction.
- Storage: \`salary_runs.tds\`.
- No tax engine.

### PT

- Source: employee ID and designation through \`isPtExempt()\`.
- Function: \`lib/salary/pt-policy.ts\`.
- Formula: zero or 200.
- Storage: \`salary_runs.pt\`.
- Fixed-fee path stores zero by function design.

### Advances

Source table:

    salary_advances

Query:

    sumAdvances(employeeId, month)

Formula:

    SQL SUM(salary_advances.amount), default 0

The sum enters \`MonthInputRow.input.advances\`, then the compute function subtracts it.

Stored run value:

    salary_runs.advances

### Pending balance

Source:

    Most recent prior disbursed salary_runs row

Function:

    lastDisbursedRemainder(employeeId, beforeMonth)

Formula:

    prior remainder = max(0, prior net_payable - prior disbursed_amount)

If \`disbursed_amount\` is null:

    prior paid = prior net_payable

The result enters current \`pendingBalanceIn\` and is added to net pay:

    net = gross - deductions + pendingBalanceIn

Pending balance is therefore a carry-forward credit, not a deduction.

### Salary-breakup overlays

The salary register has separate overlays:

- Wave-off days.
- Payout adjustment.
- Amount paid.
- Admin notes.

Wave-off and payout adjustment affect effective payment calculations in the payment module, but do not mutate the stored base \`salary_breakup.final_payment\`.

# Net-pay root audit

## Generation

Main action:

    generateSalary(month) in app/(app)/salary/actions.ts

Actual flow:

    requireAdmin()
      -> refreshSalaryMonth()
      -> assembleMonthInputs()
      -> computeForRow()
      -> upsert salary_runs
      -> syncBreakupFromApp()
      -> revalidate salary routes

Stored computed values:

- \`payable_days\`
- \`late_marks\`
- \`late_deduction_days\`
- \`gross\`
- \`pt\`
- \`tds\`
- \`advances\`
- \`pending_balance_in\`
- \`net_payable\`
- \`pay_type\`
- \`worked_hours\`
- \`hourly_rate\`
- \`target_hours\`
- \`overtime_hours\`
- \`overtime_amount\`
- \`source\`
- \`generated_by_id\`

Regeneration:

- Recomputes calculated fields.
- Preserves \`disbursed\`.
- Preserves \`disbursed_amount\`.
- Preserves \`approved_by_id\`.
- Can overwrite manually edited advances and pending balance because assembler re-reads source values.

## Manual run edit

Function:

    editRun(runId, { advances, pendingBalanceIn })

Formula:

    net = stored gross - stored pt - stored tds - edited advances + edited pending balance

Restrictions:

- Admin only.
- Refuses already-disbursed runs.
- Writes only advances, pending balance, net payable, and updated timestamp.

## Stored versus dynamic

\`salary_runs.net_payable\` is stored.

It is recalculated by:

- Salary generation.
- Manual run edit.

It is not recalculated automatically on every page read.

A later salary regeneration can replace generated values from current profile and attendance inputs.

## Salary breakup mirror

Function:

    syncBreakupFromApp(month)

For each computed input with a valid profile:

1. Calculate \`b = computeForRow(row)\`.
2. Find existing \`salary_breakup\` row by employee ID.
3. Fall back to normalized employee name for unlinked/name-drifted rows.
4. Update existing row or insert new row.
5. Write computed fields.

Mappings:

    b.payableDays       -> salary_breakup.total_days_worked
    b.effectiveDays     -> salary_breakup.final_working_days
    b.annualCtc         -> salary_breakup.annual_ctc
    b.monthlyCtc        -> salary_breakup.monthly_ctc
    b.gross             -> salary_breakup.payable_after_leave
    b.pt                -> salary_breakup.pt
    b.gross - b.pt      -> salary_breakup.payable_after_pt
    b.advances          -> salary_breakup.advance
    b.pendingBalanceIn  -> salary_breakup.previous_pending
    b.net                -> salary_breakup.final_payment

The sync deliberately preserves payment and administrative overlays.

# Salary profile, breakup, and register relationship

## Three structures

### salary_profiles

Current profile and pay-engine inputs.

Authoritative for:

- Current annual CTC.
- Current monthly TDS.
- PT-exempt profile flag as data.
- Pay basis fields.

### salary_ctc_breakup

Component split.

Not authoritative for payroll total. Current \`salary_profiles.annual_ctc\` remains engine authority.

### salary_breakup

Accounts-facing salary register and imported sheet mirror.

Stores attendance, computed salary, payment, and manual overlay fields.

## Two different synchronization paths

### App payroll mirror

    generateSalary()
      -> refreshSalaryMonth()
      -> syncBreakupFromApp()

This path writes app-computed payroll values and preserves payment overlays.

### Google Sheet sync

Function:

    runSalaryBreakupSync() in lib/salary/breakup-sync.ts

Behavior:

- Reads Google Sheet with read-only Sheets scope.
- Parses and validates rows.
- Resolves employee IDs by normalized name and reviewed aliases.
- Reports unmatched names instead of guessing.
- Deduplicates by normalized employee name and month.
- Upserts on \`salary_breakup(employee_name, month)\`.
- Runs writes in one transaction.
- Records \`sync_runs\`.
- Does not delete rows when sheet rows disappear.
- Preserves previous good table state on failure.

This creates a real inconsistency risk: app payroll and Google Sheet sync are separate writers. The current system uses safeguards, but both can update \`salary_breakup\` from different sources.

## Accounts reader

The salary page:

    app/(app)/salary/page.tsx

calls:

    salaryBreakupMonths()
    listSalaryBreakup(month)

The reader:

- Joins \`salary_breakup\` to \`employees\` for active state and avatar.
- Hides linked inactive employees.
- Excludes configured unmatched historical names.
- Deduplicates by employee ID or normalized name.
- Keeps lowest \`sr_no\`.
- Displays/export salary register data.

This is a reporting/register relationship, not a general-ledger relationship.

# C. FINANCIAL FLOW

## Salary to payroll

    salary_profiles
      + attendance inputs
      + salary advances
      + prior disbursed remainder
      -> assembleMonthInputs()
      -> computeForRow()
      -> salary_runs

## Salary to salary-breakup register

    salary_runs calculation
      -> syncBreakupFromApp()
      -> salary_breakup

The mirror stores computed values and preserves payment/administrative overlays.

## Salary to payment

There are two distinct payment paths.

### Salary register payment path

Functions:

- \`setSalaryAmountPaid()\`
- \`setSalaryPaid()\`
- internal \`writePayment()\`

Source row:

    salary_breakup

Payment calculation:

    totalPayable = round2(netAfterWaiveOff(row))
    amountPaid = round2(max(0, stored amountPaid))
    balance = max(0, totalPayable - amountPaid)
    status = unpaid | partial | paid

Settlement tolerance:

    SETTLED_EPSILON = 0.5

The action updates:

- \`salary_breakup.amount_paid\`
- \`salary_breakup.paid\`
- \`salary_breakup.paid_at\`
- \`salary_breakup.paid_by_id\`

It does not insert a \`salary_payments\` row.

When the row becomes settled, the action schedules payslip email through:

    mailPayslipOnPaid()

This path has no direct Accounts ledger insert.

### salary_payments ledger path

Table:

    salary_payments

Foreign keys:

- \`salary_run_id -> salary_runs.id\`
- \`employee_id -> employees.id\`
- \`incentive_entry_id -> incentive_entries.id\`

Salary payment rows are inserted by incentive payout/manual incentive payment flows, not by the normal salary-register settlement action.

Functions include:

- \`payIncentivesWithRun()\` in \`app/(app)/salary/incentive-payout/actions.ts\`.
- \`recordManualIncentivePayment()\` in \`lib/incentive/record-manual-payment.ts\`.

These rows can carry:

- Employee.
- Salary run ID or null.
- Month.
- Kind (\`salary\` or \`incentive\`).
- Amount.
- Paid date.
- Method.
- Note.
- Created-by employee.

Normal salary-register payment and salary-payments ledger are therefore not one universal payment path.

## Salary to Accounts

Direct evidence inspected:

- \`salary_breakup\` is declared as its own table.
- No foreign key from \`salary_breakup\` to Accounts ledger, journal, chart-of-accounts, or bank-entry table was found.
- \`app/(app)/salary/page.tsx\` reads \`salary_breakup\` directly.
- Salary exports read \`salary_breakup\) directly.
- Accounts salary-related views use salary register or incentive payment readers.
- No salary generation action inserts a general-ledger journal entry.
- No salary action calls an Accounts ledger-write API.

Conclusion:

    NO DIRECT ACCOUNTING RELATIONSHIP FOUND.

What exists:

1. Salary calculation writes \`salary_runs\`.
2. App payroll mirror writes \`salary_breakup\`.
3. Salary UI and exports report \`salary_breakup\`.
4. Separate \`salary_payments\` records exist for specific payment/incentive flows.
5. These are reporting and payment records, not general-ledger journal entries.

## Salary to reimbursements

Reader:

    getReimbursementsForMonth(employeeId, month)

Source:

    module_submissions

Selection:

- Module equals \`reimbursement\`.
- Employee matches.
- Row is not archived.
- Paid claims use \`adminFields.payment_date\`.
- Unpaid claims use expense date.
- Amount reads \`fields.amount\`.
- State reads approved/rejected/payment fields.

Outputs:

- Reimbursement lines.
- Paid this month.
- Awaiting payment.

The inspected salary calculation functions do not pass reimbursement amounts into:

- \`computeSalary()\`
- \`computeDailySalary()\`
- \`computeHourlySalary()\`
- \`computeFixedFeeSalary()\`
- \`salary_runs.net_payable\`

Conclusion:

    REIMBURSEMENT IS READABLE BY SALARY EARNINGS SURFACES BUT IS NOT AN INPUT TO CORE SALARY NET PAY.

## Salary to assets

Asset table:

    hr_assets

Employee relation:

    hr_assets.issued_employee_id -> employees.id

Asset actions create, update, list, and delete HR assets.

Search across schema and salary code found no salary relation for:

- Asset recovery.
- Asset repayment.
- Asset liability.
- Salary deduction.
- Payroll adjustment.
- Loan recovery.
- Asset-linked salary payment.

Conclusion:

    NO SALARY-ASSET FINANCIAL RELATIONSHIP EXISTS IN CURRENT SCHEMA.

The employee-to-asset assignment exists. The salary-to-asset money flow does not.

# D. GAPS / DISCONNECTS

## 1. No tax calculation root

TDS is configured as a monthly number. No taxable-income engine, slabs, exemptions, annual projection, or tax regime calculation was found.

Result:

    TDS source is known.
    TDS calculation is not present.
    Payroll deduction is present.

## 2. PT fields can be misleading

\`salary_profiles.pt_exempt\` exists, but \`lib/salary/pt-policy.ts\` says it is not policy-authoritative. Generated payroll derives exemption from employee ID and designation, and hourly assembly forces PT exemption.

This creates multiple PT-related representations that must be interpreted by path.

## 3. No period-versioned CTC history

Current profile CTC is stored in \`salary_profiles.annual_ctc\`. Historical salary runs freeze \`salary_runs.annual_ctc\`, but there is no complete versioned profile history for periods without a run.

## 4. Salary run and salary breakup can diverge

Reasons:

- \`salary_runs\` is canonical generated payroll.
- \`salary_breakup\` can be imported from Google Sheets.
- \`salary_breakup\` has manual payment, wave-off, adjustment, and note overlays.
- Regeneration updates computed breakup fields but preserves overlays.
- Sheet synchronization is a separate writer.
- Historical sheet rows can remain when source rows disappear.

## 5. Salary register payment is not salary-payments ledger

\`writePayment()\` updates \`salary_breakup.amount_paid\`. It does not insert \`salary_payments\`.

\`salary_payments\` is populated by incentive/manual payout paths and can link to a salary run. These are separate records and can diverge.

## 6. No direct general-ledger entry

No salary action inserts journal or ledger entries. Accounts-facing salary is a register/reporting view.

## 7. No salary-asset recovery

HR assets link to employees, but no salary deduction or recovery relation exists.

## 8. Reimbursements are separate from core net pay

Salary earnings surfaces can read reimbursement submissions, but reimbursement values do not enter the core salary calculation functions or \`salary_runs.net_payable\`.

## 9. Different month calculation eras

The same employee can use different logic depending on month:

- Frozen HR sheet, legacy day-based path.
- July 2026 merged transition path.
- September 2026 onward app-graded hours/payable-day path.

Comparing months requires checking the month era and the \`salary_runs.source\` and \`pay_type\` values.

## 10. Late marks are not currently a second payroll deduction

Day-code logic records late marks. \`assembleMonthInputs()\` sets \`applyLate = false\`. Current payroll therefore avoids applying the old every-three-late half-day deduction on top of worked-hour/day-code effects.

## 11. Payment amount can include register overlays

The salary register's effective payment uses:

- Base \`final_payment\`.
- Wave-off day add-back.
- Signed payout adjustment.
- Existing amount paid.

Therefore register payment status can differ from raw \`salary_runs.net_payable\`.

## 12. No universal salary payment destination

Some money records point to salary runs. Some point to incentive entries. Salary-register settlement stores payment on \`salary_breakup\`. There is no single payment destination table for every salary-related rupee.

# Complete root map

    employees.id
      + employees.worker_type
      + employee schedule
      + attendance_logs
      + holidays
      + approved leave_requests
      + comp_off_credits
      + salary_profiles
      + salary_advances
      + prior disbursed salary_runs
        -> computeDayCode()
        -> reconcileMonth()
        -> payableHoursForMonth()
        -> getMonthDashboard() / sheet readers
        -> assembleMonthInputs()
        -> payBasisFor()
        -> isPtExempt()
        -> computeForRow()
           -> computeSalary()
           -> computeDailySalary()
           -> computeHourlySalary()
           -> computeFixedFeeSalary()
        -> gross, PT, TDS, advances, pending balance, net
        -> salary_runs
        -> syncBreakupFromApp()
        -> salary_breakup
        -> salary register, exports, payslips
        -> writePayment()
           -> salary_breakup.amount_paid / paid
           -> payslip email
        -> separate salary_payments only for salary-run/incentive payout flows
        -> no direct general-ledger relation
        -> employee-only hr_assets relation
        -> no salary-asset financial relation

# Audit conclusion

For any stored payroll number, the root is traceable through the following chain:

    database profile/attendance field
      -> named query
      -> named attendance or salary function
      -> exact intermediate formula
      -> stored salary_runs field
      -> salary_breakup mirror or payment path

TDS is not traceable to taxable income because current code does not calculate taxable income. PT is traceable to the explicit PT policy and pay-path rules. Accounts is connected through salary-breakup reporting and selected payment records, not through a general ledger. Assets are connected to employees only, not to salary finances.

No calculation, tax rule, payroll rule, Accounts relation, Asset relation, or production record was changed in this second audit pass.

## Layer 2 deduction audit (current payroll)

This section describes the authoritative generated-payroll path. It does not
turn optional register overlays or disconnected legacy/V2 utilities into a
second payroll engine.

| Item | Source and input | Formula | Stored value and entry point |
| --- | --- | --- | --- |
| Attendance / absence / unpaid leave | Attendance month reconciliation supplies `payableDayValue`; day codes define `P`, `W/O`, `H`, `PL`, and `CO` as 1; `H/D` as 0.5; `A` and `LWP` as 0. | `gross = (monthly salary / actual calendar days) * payableDayValue` | `salary_runs.payable_days`, then `salary_runs.gross`. An absent/LWP day reduces the earned day value once; there is no separate subtraction. |
| Half day | Authoritative attendance day code `H/D`. | It removes 0.5 of the actual-month per-day rate. | Included in `gross` through `payable_days`; never a second line deduction. |
| Hourly shortfall | Hourly/intern `workedMinutes` from the attendance month and the configured schedule. | Current hourly path pays whole worked hours at Layer 1 per-hour rate. Fewer eligible hours produce less gross; no additional hourly-shortfall deduction is written. | `salary_runs.worked_hours`, `hourly_rate`, and `gross`. |
| Late marks | Attendance records late marks, but current `assembleMonthInputs()` sets `applyLate = false`. | None in the live generated path. The historical every-three-lates half-day logic receives zero input. | No live late-mark deduction in `salary_runs`. |
| PT | Current generated path uses `isPtExempt()` (hourly is exempt under the current pay-path policy). | Existing `PT_AMOUNT` only when not exempt. | `salary_runs.pt`; mirrored once to `salary_breakup.pt`; subtracted once from net. `salary_profiles.pt_exempt` remains a legacy/import representation, not the live generated authority. |
| TDS | `salary_profiles.tds_monthly`. | Configured monthly value; no tax-slab or taxable-income computation exists. | `salary_runs.tds`; mirrored only as part of the run/breakup result; subtracted once from net. |
| Salary advances | Current employee/month rows in `salary_advances`. | Sum of that month’s advance amounts. | `salary_runs.advances`; mirrored to `salary_breakup.advance`; subtracted once from net. This is not the outstanding-balance model. |
| Pending balance in | Latest prior disbursed run remainder. | `max(0, prior net payable - prior disbursed amount)`. | `salary_runs.pending_balance_in`; added once to net because it is money still owed, not a deduction. |
| Manual register overlays | Super-admin `salary_breakup.waive_off_days` / `payout_adjustment`. | Wave-off uses `monthly_ctc / actual days_in_month`; payout adjustment is signed. | Applied after base `final_payment` only in register/payment/payslip surfaces. Nonzero overlays now require notes; they remain distinguishable from calculated payroll. |
| Salary adjustments / CTC V2 | `salary_adjustments` and V2 pro-ration helpers. | No current `salary_runs` or `salary_breakup` writer consumes them. | Not a generated-payroll deduction; excluded from the canonical net formula. |

The generated-run formula is unchanged:

    net_payable = gross - pt - tds - advances + pending_balance_in

`syncBreakupFromApp()` mirrors these generated values into `salary_breakup`.
The register can then show its explicitly named manual overlays separately. A
wave-off with a missing or invalid `days_in_month` now adds back zero rather
than silently pricing a day with a fixed 30-day denominator.

### Worker-type boundary

Worker type does not itself choose an unexplained rate. `payBasisFor()` selects
the existing daily, hourly, or fixed-fee path. Daily/full-time pay consumes
attendance day values. Hourly/intern pay consumes worked whole hours and may
have existing overtime eligibility; eligible overtime is an earning at the same
Layer 1 hourly rate, not a deduction. Schedule, PT exemption policy, TDS
configuration, and overtime eligibility are the visible sources of differences.
