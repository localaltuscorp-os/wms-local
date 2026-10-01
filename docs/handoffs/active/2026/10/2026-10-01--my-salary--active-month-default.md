# My Salary active-month default

- Date: 2026-10-01
- Work item: my-salary
- Status: implemented and unit-tested

## Objective

Open My Salary on the active payroll month rather than a later, future-dated
salary record.

## Root cause and change

`loadMySalaryMonths` sorted stored history newest-first, while the client opens
the first item and attaches its initial daily ledger to that item. A December
record could therefore become the default while October was the active month.

`prioritizeActiveSalaryMonth` in `lib/salary/period.ts` now moves the active
IST month to the first position when it exists. The remaining history stays
newest-first. `lib/salary/my-salary.ts` applies that ordering both before the
initial ledger selection and after any refresh-induced reload.

## Impact

- Database/migrations: none.
- Security/access: none; all existing target-employee authorization remains
  unchanged.
- Rollback: remove the ordering helper use in `loadMySalaryMonths`.

## Validation

- Passed: `npm test -- --run tests/unit/my-salary.test.ts tests/unit/salary-period.test.ts tests/unit/salary-compute.test.ts`
  - 3 files, 36 tests passed.
- Passed: `git diff --check`.
- The repository-wide `npm test` run also passed: 392 test files passed, 5
  skipped; 5,287 tests passed, 34 skipped.

## Follow-up

Exercise `/my-salary` while signed in with a current-month record and one or
more future-dated records; the active month should be shown on first load and
the future records must remain available in the month selector.
