# Attendance full-hours and late-half-day grace

- Date: 2026-10-09
- Work item: `bugfix/attendance-full-hours-grace`
- Status: preview pending

## Objective

Make completed full required hours take precedence over attendance clock marks. In a missed-target week, protect the first three late-caused half-days; charge the fourth and later late-caused half-days at half a day each. The allowance resets each week.

## Implementation

- `lib/attendance/status.ts`: a worker who completes their resolved full-day minutes is graded `P`, while late/left-early flags remain available for reporting.
- `lib/attendance/hour-balance.ts`: keeps the existing weekly-target waiver and adds the first-three-per-week protection only for half-days that also carry a late mark. Non-late half-days remain chargeable in a missed-target week.
- `lib/salary/day-ledger.ts`: gives protected late half-days an employee-readable waiver reason instead of incorrectly describing every waiver as a weekly-target waiver.
- Tests cover full-hours precedence, the 10:30-to-11:30 / 19:30 short-day example, the first-three late-half-day protection, and a fresh weekly allowance.

## Database and access

No schema, migration, database data, authentication, or authorization changes.

## Validation

- `pnpm.cmd exec vitest run tests/unit/attendance-status.test.ts tests/unit/late-half-day-grace.test.ts tests/unit/attendance-worker-config.test.ts tests/unit/payroll-month.test.ts tests/unit/daily-salary-report.test.ts` — passed, 166 tests.
- `pnpm.cmd exec eslint lib/attendance/status.ts lib/attendance/hour-balance.ts lib/salary/day-ledger.ts tests/unit/attendance-status.test.ts tests/unit/late-half-day-grace.test.ts tests/unit/attendance-worker-config.test.ts` — passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm.cmd typecheck` — passed.

## Deployment and rollback

This branch is intended for a Vercel preview only. It has not been merged or deployed to production. Rollback is a normal revert of the branch commit; no database rollback is required.

## Remaining work

Create and review the preview deployment. Confirm the intended UI wording for the late/waived status before requesting production release.
