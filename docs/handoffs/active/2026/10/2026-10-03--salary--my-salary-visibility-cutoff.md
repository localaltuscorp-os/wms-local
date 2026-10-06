# My Salary visibility and September 2026 cutoff

## Objective

Restore visibility of valid September 2026 salary records and set September
2026 as the first month of the new attendance-priced salary calculation.

## Root cause and proof

Read-only aggregate database inspection found 23 active employees. September
2026 had 13 `salary_runs`, no linked `salary_breakup` rows, and 10 employees
with neither record. Eight of those ten had valid pay configuration.

`loadMySalaryMonths()` refreshed only the current open month, then listed stored
`salary_runs` and legacy `salary_breakup` records. It never created a missing
closed September run. The month selector correctly displayed only that returned
list, so it had no September option for those configured employees. This was not
a permissions or month-filter issue. The two remaining missing employees had no
pay profile and remain intentionally without a zero-value payroll record.

## Changes

- `PAYROLL_HOURS_FROM` is now `2026-09`.
- All refresh writers reject pre-September months, preserving historical rows.
- Admin generation actions reject pre-September requests rather than overwriting
  historical payroll.
- A later My Salary page view creates only a missing September run through the
  canonical `refreshSalaryRun()` upsert. Existing September rows are not
  repriced by that backfill path.
- Existing unique key `(employee_id, month)` remains the duplicate protection.
- September onward continues through existing calendar-day/per-day/per-hour and
  attendance payroll functions. August and earlier retain existing history.

## Files

- `lib/attendance/payroll-month.ts`
- `lib/salary/refresh-run.ts`
- `lib/salary/my-salary.ts`
- `app/(app)/salary/actions.ts`
- `tests/unit/payroll-month.test.ts`
- `tests/unit/salary-rate-root.test.ts`
- `SALARY_FINANCIAL_LINEAGE_AUDIT.md`

## Validation

- `pnpm exec vitest run tests/unit/payroll-month.test.ts tests/unit/salary-rate-root.test.ts tests/unit/daily-salary-model.test.ts tests/unit/my-salary.test.ts tests/unit/salary-compute.test.ts tests/unit/attendance-hourly-payroll.test.ts tests/unit/leave-payroll-chain.test.ts tests/unit/salary-payment.test.ts`
  - 8 files, 162 tests passed.
- `pnpm typecheck` completed with no diagnostics.
- Focused ESLint completed with no diagnostics for changed source and test files.
- `git diff --check` passed.

## Database and deployment

No migration and no direct database write were performed. After deployment, an
affected configured employee opening My Salary during October 2026 or later
creates the missing September run through the canonical unique upsert. The two
employees without salary configuration still need a valid profile before any
salary can be generated.

## Rollback

Revert the listed code changes. No data migration requires rollback.
