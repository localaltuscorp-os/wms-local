# Salary attendance totals

- **Date:** 2026-10-09
- **Work item:** `feature/salary-attendance-totals`
- **Status:** Implemented locally; ready to push for preview.

## Objective

Make the My Salary attendance breakdown explain its payroll denominator by
showing declared holidays, Sundays/weekly offs, and effective payable days.

## Implementation

- `lib/salary/my-salary.ts` derives whole-month holiday and weekly-off counts
  from the existing graded attendance calendar. Holidays falling on a weekly off
  are counted only as a weekly off, preventing double counting.
- `components/salary/my-salary-view.tsx` displays those values and renames the
  existing scheduled-day denominator to **Effective Payable Days**.
- `tests/unit/salary-slip-pdf.test.ts` updates the shared salary-month fixture.

## Scope and safety

- Display-only change. It does not change salary calculations, attendance
  grading, permissions, database schema, migrations, or production data.
- A weekly off represents the employee's configured calendar; it is normally a
  Sunday but remains correct for alternate schedules.

## Validation

- Passed: ESLint on the changed source and test files.
- Passed: `vitest run tests/unit/salary-slip-pdf.test.ts` (36 tests).
- Passed: `git diff --check`.
- Full local TypeScript check reached the existing local dependency issue in
  `lib/email/transport.ts` (missing `nodemailer` types). It reported no errors
  from this change; GitHub CI remains the authoritative full typecheck.

## Release and rollback

- Requires a preview and review before release.
- Roll back by reverting the feature commit; no database rollback is required.
