# Weekly late-mark payroll policy

- **Date:** 2026-10-09
- **Work item:** `feature/weekly-late-penalty`
- **Status:** Preview branch updated; production is not merged or deployed.

## Objective

Apply the approved attendance rule from September 2026: a full-time employee who
does not meet the applicable weekly hours target receives no late penalty for
up to three late marks; the fourth late mark creates one half-day deduction,
and each later late mark creates one additional half-day deduction. Weekly
surplus hours must not carry into a later week.

## Implementation

- `lib/attendance/hour-balance.ts`
  - Adds the September 2026 effective-date constant and the 54-hour full-time
    late-mark calculation.
  - Stops intra-month carryover between weeks from September 2026.
  - Caps ordinary payable hours per week from September 2026.
- `lib/attendance/payroll-month.ts`
  - Carries the calculated late-penalty half-days into payroll data.
- `lib/salary/compute.ts`, `lib/salary/generate.ts`, and
  `lib/queries/attendance-summary.ts`
  - Price each policy half-day at 0.5 of one calendar-day salary for the
    daily/monthly-CTC salary path.
- `lib/hr/access.ts`
  - Accepts a null session email in the HR access helper without changing
    authorization behavior; missing email remains non-super-admin.
- `tests/unit/weekly-late-penalty.test.ts`
  - Covers the 4/5/6 late outcomes, 54-hour exemption, effective date,
    no-carry behavior, and salary deduction.

## Scope and behaviour

- The policy is effective from September 2026. Four late marks below the
  applicable weekly target deduct one half-day; each additional late mark
  deducts one further half-day.
- The new late-mark penalty is limited to the standard 54-hour full-time
  schedule. Existing non-54-hour worker configurations remain unchanged.
- Holiday and partial weeks use their reduced schedule target, so employees are
  not penalised for unscheduled days.
- Existing historical months before September 2026 retain their previous
  reconciliation behavior.
- This changes attendance and payroll calculation code only; it does not
  modify HR policy pages, policy CMS records, or employee data.
- No database schema or data migration is required; the policy is calculated
  from existing attendance records whenever a month is read or generated.

## Validation

- Passed: focused Vitest run — 3 files, 76 tests.
- Passed: ESLint on all changed source files and the new test.
- Passed: `git diff --check`.
- The original CI blocker was the nullable email type mismatch in
  `lib/salary/salary-people.ts`; the safe helper-input type fix is included in
  this branch and must be verified by CI.

## Release notes

- The September-corrected preview was deployed from `f309ae1e` before the CI
  type-safety follow-up. A new preview should be created after that follow-up
  is pushed.
- Before release: verify CI, inspect a representative September payroll
  calculation, and confirm the feature branch contains only the listed files.
- Rollback is a revert of the feature commit; no database rollback is needed.
