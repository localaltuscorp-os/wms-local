# Forgotten punch-out attendance policy

- Date: 2026-10-06
- Work item/branch: `bugfix/forgotten-punchout-absent`
- Objective: Prevent a forgotten punch-out from contributing punch-in-to-midnight hours; classify the closed day as Absent.
- Status: Implemented and focused validation passed.

## Summary

The attendance grader previously treated a system auto-closed forgotten logout as Half Day. If the nightly cron did not create that row, a past unmatched check-in was measured through 23:59 and could inflate the weekly 54-hour total. The shared grader now returns `A`, zero day value, and zero worked minutes for both a marked system auto-close and a past unmatched check-in. A currently open shift remains live until the day closes.

## Files/components changed

- `lib/attendance/status.ts`: changed finalized forgotten-log-out grading to Absent and added the closed-day fallback.
- `lib/queries/attendance-status.ts`: tells the grader when an attendance date is in the past.
- `lib/attendance/auto-punch-out.ts`: updated the stored system note and policy documentation.
- `app/api/cron/attendance-autoout/route.ts`: updated cron and audit descriptions to the Absent policy.
- `lib/goals/flag.ts`: documented that the legacy flag name now controls the Absent policy.
- `tests/unit/attendance-auto-half-day.test.ts`, `tests/unit/forgotten-logout.test.ts`: updated regression coverage.

## Database and migrations

None. Existing auto-punch rows retain the same recognizable stamp and are regraded by the shared read path.

## Security and authorization

None. Cron authentication, attendance mutation authorization, and correction permissions are unchanged.

## Testing

- `pnpm.cmd exec vitest run tests/unit/attendance-auto-half-day.test.ts tests/unit/forgotten-logout.test.ts tests/unit/attendance-status.test.ts tests/unit/attendance-summary.test.ts` — passed, 4 files and 38 tests.
- `pnpm.cmd exec eslint lib/attendance/status.ts lib/queries/attendance-status.ts lib/attendance/auto-punch-out.ts app/api/cron/attendance-autoout/route.ts tests/unit/attendance-auto-half-day.test.ts tests/unit/forgotten-logout.test.ts` — passed.
- Clean latest `Altus-corp/Altus-OS` `origin/main` worktree: the same focused Vitest command passed all 38 tests and the same targeted ESLint command passed.
- Repository-wide typecheck was attempted in the original checkout: the default heap exhausted; with a 4 GB heap it reported stale generated `.next` route declarations unrelated to these attendance files.

## Known issues and remaining work

- The environment variable remains named `FORGOTTEN_LOGOUT_HALF_DAY` for deployment compatibility even though the enabled policy now marks Absent.
- Confirm the policy owner expects the salary impact: a forgotten logout contributes zero hours and zero attendance for that day.
- Repository-wide typecheck remains blocked in the original checkout by stale generated `.next` route declarations unrelated to this work.

## Deployment and rollback

Deploy through the development repository review flow. No migration is required. Rollback is the code revert that restores the prior Half Day classification.

## Commit/release SHA

Attendance implementation commit on the clean latest `origin/main`-based branch: `5aeedffa`.
