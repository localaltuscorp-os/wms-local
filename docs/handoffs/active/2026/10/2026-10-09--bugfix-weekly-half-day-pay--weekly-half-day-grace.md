# Weekly attendance penalty correction

- Date: 2026-10-09
- Work item: `bugfix/weekly-half-day-pay`
- Status: committed and pushed for review; preview is ready; production merge is
  blocked by an unrelated failed Vercel status check

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
- Follow-up on the same branch:
  - An arrival from an employee's configured `lateAfter` cutoff through the
    next 60 minutes remains a late mark; a later arrival grades Half Day when
    the employee has met the configured half-day minimum.
  - The daily salary report now shows the total salary protected by the weekly
    target waiver and lists each affected date, reason, and amount. The values
    come from the server-built ledger; the browser does not calculate them.

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
- Follow-up validation: 220 focused attendance and salary-report tests passed,
  followed by `pnpm typecheck` and `git diff --check`.
- GitHub Actions CI passed on pull request #17: dependency installation,
  type-check, and the full test suite. Visual tests were skipped by CI because
  the repository has no complete secret-backed visual-test environment.
- Vercel preview is ready at
  `https://altus-aegky0cli-altus-corp1.vercel.app`.

## Release evidence

- Feature commit: `29e1dd84694a18693cd4fa761c189b2aa541b589`
- Pull request: `https://github.com/Altus-corp/Altus-OS/pull/17`
- Base at review time: `e0977f6787cc861a2d4b10dd4c0b3de8e34e5997`

## Remaining release steps

1. Correct or remove the stale GitHub `Vercel` status integration that points
   to the separate `feature-salary-monthly-ctc-column` Vercel project. It was
   already failing before this branch's GitHub Actions job began, while the
   actual `altus-os` preview above is ready.
2. Once the release checks are clean, merge pull request #17 into
   `Altus-corp/Altus-OS:main` and monitor the production deployment.

## Rollback

Revert the commit that introduces this policy change. No migration or data
rollback is required.
