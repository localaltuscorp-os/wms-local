# Holiday calendar date corrections

- Date: 2026-09-30
- Work item: `bugfix/holiday-calendar-date-corrections`
- Base commit: `71d75215`
- Status: Verified locally; not committed or pushed.

## Objective

Verify the requested 2026 and 2027 Holiday List corrections, prevent duplicate additions, and protect the published calendar from reverting to the incorrect dates.

## Current implementation

`lib/hr/holidays-2026.ts` is the published calendar used by the HR Holiday List. Its normalized dates also flow through `publishedHolidayDates` into the attendance holiday set, so the same calendar determines both the displayed days off and attendance/payroll treatment. The `/hr/holidays` page merges this published list with genuine ad-hoc database holidays; it does not need database rows for published dates.

## Result

- The published 2026 list already excludes 02 October, 09 November, 24 November, and every December date.
- The published 2027 list already uses 22 March for Holi Day 2, 14 September for Ganpati Final Day, and 31 October for Bhai Dooj.
- No holiday rows or migrations were added, because adding ad-hoc rows for dates already in the published source would duplicate the calendar.
- Added regression assertions for the requested absent and present dates, labels, and weekdays.

## Files changed

- `tests/unit/holiday-leave-remote-salary-chain.test.ts`

## Database and security impact

None. No database operations, migrations, access-control changes, or production data changes were performed.

## Validation

- `corepack pnpm exec vitest run tests/unit/holiday-leave-remote-salary-chain.test.ts` — passed (1 file, 52 tests).
- `git diff --check` — passed.
- A prior attempt using `corepack pnpm test -- <file>` ran the whole unit suite because of the repository script's argument separator; it exposed unrelated existing suite failures. The focused Vitest command above is the authoritative result for this work.

## Remaining work and deployment

No source-data change is needed: the requested calendar is already in the published source. If a deployed screen still displays the old dates, it is running an older deployment or contains separate live ad-hoc database rows; inspect the deployment revision and those rows through the authorized HR/Admin workflow before changing live data. Rollback is a revert of the regression test only.
