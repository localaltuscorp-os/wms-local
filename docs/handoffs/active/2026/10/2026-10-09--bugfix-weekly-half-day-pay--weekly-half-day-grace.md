# Weekly attendance penalty correction

- Date: 2026-10-09
- Work item: `bugfix/weekly-half-day-pay`
- Status: implemented locally; not committed, pushed, reviewed, or deployed

## Objective

Apply the approved weekly attendance policy using each employee's own configured
schedule:

- A half-day in a week that reaches its weekly target is waived.
- In a week that misses its target, every half-day deducts half a day's salary.
- A late arrival is measured against the employee's configured `lateAfter`
  cutoff. The first three late arrivals in a missed-target week are warnings;
  the fourth and later late arrivals deduct half a day's salary.
- Leaving before the employee's configured `earlyBefore` cutoff grades as a
  half-day after the configured half-day minimum has been worked. Less than
  that minimum remains absent.

## Changes made

- `lib/attendance/hour-balance.ts`
  - Removed the incorrect standalone half-day grace allowance.
  - Applies a half-day charge immediately when a week misses its target.
  - Applies the three-warning threshold only to late arrivals, against every
    employee's resolved weekly target.
- `lib/attendance/payroll-month.ts`
  - Keeps the daily payroll path aligned with the target-met half-day waiver.
- `lib/attendance/status.ts`
  - Uses employee-specific late and early cutoffs for attendance grading.
  - Makes an early checkout a half-day only after the configured half-day
    minimum is met; shorter attendance remains absent.
- `lib/salary/day-ledger.ts`, `lib/salary/compute.ts`
  - Updated explanation text to describe the weekly policy.
- Attendance self-view and attendance summary comments now explain the weekly
  policy accurately.
- Added and updated unit tests for half-day deductions, employee-specific early
  cutoffs, part-time late policy, and duplicate-penalty prevention.

## Database and migration impact

None. This changes future payroll calculations only. Existing stored salary
runs are historical records and must be regenerated through the normal payroll
process if they need recalculation under the corrected policy.

## Security impact

None.

## Verification

- Passed focused tests using the existing workspace Vitest installation:
  - `tests/unit/attendance-worker-config.test.ts`
  - `tests/unit/payroll-month.test.ts`
  - `tests/unit/attendance-hourly-payroll.test.ts`
  - `tests/unit/daily-salary-model.test.ts`
  - `tests/unit/daily-salary-report.test.ts`
  - `tests/unit/attendance-status.test.ts`
  - `tests/unit/weekly-late-penalty.test.ts`
  - Result: 239 tests passed across 7 files.
- Passed focused ESLint over all changed source and test files.
- `git diff --check` passed.
- Passed full TypeScript validation with a temporary 4 GB Node heap after
  installing the lockfile-pinned dependencies in this isolated worktree:
  `pnpm typecheck`.

## Remaining release steps

1. Review the change and confirm that the weekly target rule is the approved
   payroll policy.
2. Commit, push this feature branch, obtain a preview/review, then approve any
   production promotion separately.

## Rollback

Revert the commit that introduces this policy change. No migration or data
rollback is required.
