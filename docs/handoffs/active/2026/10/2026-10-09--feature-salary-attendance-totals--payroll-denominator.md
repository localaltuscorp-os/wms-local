# Salary attendance totals

- **Date:** 2026-10-09
- **Work item:** `feature/salary-attendance-totals`
- **Status:** Preview validated; queued for approved production release.

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
- GitHub `test` check passed for commit `9c465936e8a102827317cb30764a97a78b5e0dbf`.
- Preview deployment was Ready at `/my-salary`; its Vercel deployment is
  `dpl_CR7bJUmfyWbbR9iHmk3pwQjoZQLp`.
- On 2026-10-10, the branch was refreshed from then-current `origin/main`
  (`0dda3c80`) with merge commit `071dfe12`; Git reported no conflicts.
- The linked worktree has no installed local executable dependencies, so the
  focused lint/test could not be repeated there after the refresh. This does
  not alter the prior passing results; the refreshed branch requires a new
  GitHub `test` run before release.
- The refreshed GitHub CI run passed TypeScript but exposed one unrelated
  attendance-policy test: a fourth late mark that was already graded `H/D`
  was incorrectly waived. `lib/attendance/hour-balance.ts` now counts the
  late-mark order across all ordinary days, so that day is charged once and is
  not charged again as a separate late penalty. A fresh CI run is required.

## Release and rollback

- User approved the production release on 2026-10-10 after preview validation.
- Merge only this branch after it is refreshed with current `main`; do not
  include unrelated feature branches.
- Roll back by reverting the feature commit; no database rollback is required.
