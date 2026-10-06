# Half-day waiver salary-loss correction

- Date: 2026-10-06
- Branch: `bugfix/forgotten-punchout-absent-altus-os`
- Objective: Ensure attendance half-days forgiven by monthly grace or the weekly-hours waiver do not appear as salary lost or reduce generated salary.
- Status: Implemented and locally validated; pending review and production promotion.

## Summary

Attendance reconciliation already identified forgiven half-days, but the daily salary input still summed each `H/D` as `0.5`. This made two forgiven half-days appear as one full day of salary loss. The shared payroll-month calculation now restores the missing `0.5` only for half-days that reconciliation forgives. Chargeable half-days remain worth `0.5`.

The daily salary ledger now attributes the same restored value to forgiven dates, keeping its visible rows reconciled with the generated salary gross.

## Files changed

- `lib/attendance/payroll-month.ts`: includes reconciliation-approved half-day forgiveness in `payableDayValue`.
- `lib/salary/day-ledger.ts`: displays forgiven half-days at full daily value and explains that no salary was deducted.
- `tests/unit/payroll-month.test.ts`: covers monthly-grace, weekly-waiver, and chargeable half-days.
- `tests/unit/daily-salary-report.test.ts`: updates ledger expectations to the reconciled waiver policy.

## Database and migrations

None. No schema, migration, SQL, or stored data changes.

## Security and authorization

None. Authentication, roles, permissions, and employee lookup are unchanged.

## Testing

- `pnpm.cmd vitest run tests/unit/payroll-month.test.ts tests/unit/daily-salary-model.test.ts tests/unit/daily-salary-report.test.ts tests/unit/attendance-worker-config.test.ts` — passed, 193 tests.
- `pnpm.cmd exec eslint lib/attendance/payroll-month.ts lib/salary/day-ledger.ts tests/unit/payroll-month.test.ts tests/unit/daily-salary-report.test.ts` — passed.
- `pnpm.cmd typecheck` — reached Node's default heap limit (exit 134), with no TypeScript diagnostic emitted.
- `node.exe --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit` — passed.

## Deployment and rollback

This branch also contains the reviewed forgotten-punch-out correction recorded in the existing attendance-policy handoff. Production must be promoted only through the approved Altus-OS release workflow. Roll back this change by reverting its isolated commit; no database rollback is required.

## Remaining work

- Review the final diff and commit the isolated change.
- Push the branch and refresh the existing Vercel preview for stakeholder verification.
- Obtain release approval before merging or promoting to production.
