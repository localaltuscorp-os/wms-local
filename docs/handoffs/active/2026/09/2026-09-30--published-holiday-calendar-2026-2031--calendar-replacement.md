# Published holiday calendar replacement handoff

- **Date:** 2026-09-30
- **Branch:** `feature/published-holiday-calendar-2026-2031`
- **Status:** Ready for feature-branch preview push; not released to production

## Objective

Replace the published company holiday calendar with the supplied authoritative list for 2026 through 2031, so every existing consumer receives the same dates and labels.

## Scope

- Update the static published calendar source consumed by the HR Holiday List, attendance, target-hours, leave/comp-off, payroll-adjacent calendar readers, upcoming-holidays panel, mobile response, and merged company Holiday List.
- Extend the published-year range through 2031 because the supplied list includes 1 January 2031.
- Update calendar contract tests with the supplied dates and labels.
- Keep the Admin/HR `holidays` database table as the existing ad-hoc override and suppression layer; no production database data or migration is changed by this feature.

## Business decision recorded

The supplied calendar replaces the existing published lists, including the 2026 dates already in the past. It is authoritative for all existing holiday consumers.

## Implementation completed

- Replaced the 2026-2028 static entries with the supplied authoritative entries
  for calendar years 2026 through 2031.
- Extended `HOLIDAY_YEARS` and the shared year map through 2031, so the HR
  Holiday List and every existing published-calendar consumer use the same
  data.
- Kept supplied labels exactly, including supplied asterisks.
- Stored the supplied 1 January 2028 row under calendar year 2028 rather than
  2027, so year-based consumers receive the date in its actual calendar year.
- Updated calendar tests for the replacement list, range, labels, override
  suppression, and 2031 look-ahead boundary.

## Validation

- `pnpm exec vitest run tests/unit/holiday-calendar.test.ts tests/unit/holiday-leave-remote-salary-chain.test.ts tests/unit/company-holidays-merge.test.ts tests/unit/adhoc-holiday.test.ts` — passed: 4 files, 107 tests.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck` — passed. The first
  run at the default Node heap exhausted memory before reporting type errors;
  the repository-sized heap completed successfully.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm test` — 5,201 passed, 26 failed,
  34 skipped across 385 files. The 26 failures are the established unrelated
  repository baseline; the focused holiday suites passed and no holiday test
  failed.
- Final scoped diff review completed: only the shared holiday source, its
  focused tests, and this handoff are changed; no SQL, database, deployment,
  authorization, or production files are included.
- `git diff --check` passed. No email or credential patterns were found in the
  tracked source/test diff, and this handoff contains no personal data or
  credentials.

## Remaining work

- Commit and push this feature branch to the Development Repository for preview
  validation.
- The shared static source needs no SQL migration or database data update.
- The full unit-suite baseline still has 26 unrelated failures, so production
  promotion must wait for that baseline to be repaired and release approval to
  be completed. No production update or deployment has occurred.
