# Weekly late-mark payroll policy

- **Date:** 2026-10-09
- **Work item:** `feature/weekly-late-penalty`
- **Status:** Implemented locally; not committed, pushed, merged, or deployed.

## Objective

Apply the approved attendance rule from October 2026: a full-time employee who
does not meet the applicable weekly hours target receives no late penalty for
up to three late marks; the fourth late mark creates two half-day deductions,
and each later late mark creates one additional half-day deduction. Weekly
surplus hours must not carry into a later week.

## Implementation

- `lib/attendance/hour-balance.ts`
  - Adds the October 2026 effective-date constant and the 54-hour full-time
    late-mark calculation.
  - Stops intra-month carryover between weeks from October 2026.
  - Caps ordinary payable hours per week from October 2026.
- `lib/attendance/payroll-month.ts`
  - Carries the calculated late-penalty half-days into payroll data.
- `lib/salary/compute.ts`, `lib/salary/generate.ts`, and
  `lib/queries/attendance-summary.ts`
  - Price each policy half-day at 0.5 of one calendar-day salary for the
    daily/monthly-CTC salary path.
- `tests/unit/weekly-late-penalty.test.ts`
  - Covers the 4/5/6 late outcomes, 54-hour exemption, effective date,
    no-carry behavior, and salary deduction.

## Scope and behaviour

- The new late-mark penalty is limited to the standard 54-hour full-time
  schedule. Existing non-54-hour worker configurations remain unchanged.
- Holiday and partial weeks use their reduced schedule target, so employees are
  not penalised for unscheduled days.
- Existing historical months before October 2026 retain their previous
  reconciliation behavior.
- No database schema or data migration is required; the policy is calculated
  from existing attendance records whenever a month is read or generated.

## Validation

- Passed: focused Vitest run — 3 files, 76 tests.
- Passed: ESLint on all changed source files and the new test.
- Passed: `git diff --check`.
- Full TypeScript check reached existing unrelated errors after being rerun with
  a 4 GB Node heap allowance:
  - missing `nodemailer` types in `lib/email/transport.ts`
  - nullable email type mismatch in `lib/salary/salary-people.ts`

## Release notes

- No commit or push has been made yet.
- Before release: review the policy wording with payroll/HR, commit only the
  listed files, push this feature branch for a Vercel preview, and verify a
  representative October payroll calculation before production approval.
- Rollback is a revert of the feature commit; no database rollback is needed.
