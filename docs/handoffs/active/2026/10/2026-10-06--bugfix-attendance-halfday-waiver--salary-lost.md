# Half-day waiver salary-loss correction

- Date: 2026-10-06
- Branch: `bugfix/forgotten-punchout-absent-altus-os`
- Objective: Ensure attendance half-days forgiven by monthly grace or the weekly-hours waiver do not appear as salary lost or reduce generated salary.
- Status: Implemented and locally validated; pending review and production promotion.
- Implementation commit: `f56530d`
- Cross-page refresh commit: `0e76a4eb`

## Summary

Attendance reconciliation already identified forgiven half-days, but the daily salary input still summed each `H/D` as `0.5`. This made two forgiven half-days appear as one full day of salary loss. The shared payroll-month calculation now restores the missing `0.5` only for half-days that reconciliation forgives. Chargeable half-days remain worth `0.5`.

The daily salary ledger now attributes the same restored value to forgiven dates, keeping its visible rows reconciled with the generated salary gross.

The Accounts Salary page now exposes a super-admin-only **Refresh from Attendance** control for the selected app-payroll month. It runs the existing canonical month refresh and mirrors the result into both `salary_runs` and `salary_breakup`. This is required for months whose stored salary was generated before a calculation-policy code fix; changing code alone does not rewrite stored payroll data. Recorded disbursements, paid amounts, manual waive-offs, and payout adjustments remain untouched.

## Files changed

- `lib/attendance/payroll-month.ts`: includes reconciliation-approved half-day forgiveness in `payableDayValue`.
- `lib/salary/day-ledger.ts`: displays forgiven half-days at full daily value and explains that no salary was deducted.
- `tests/unit/payroll-month.test.ts`: covers monthly-grace, weekly-waiver, and chargeable half-days.
- `tests/unit/daily-salary-report.test.ts`: updates ledger expectations to the reconciled waiver policy.
- `app/(app)/salary/page.tsx`: exposes the controlled attendance refresh beside the salary exports.
- `components/salary/salary-attendance-refresh-button.tsx`: confirms and invokes the canonical salary refresh for the selected month.

## Consumer audit

The refresh updates both stores used across salary surfaces:

- `salary_runs`: My Salary, canonical payslip data, XLSX payroll export, salary lineage, and incentive/payroll integrations.
- `salary_breakup`: Accounts Salary, CSV/PDF payroll exports, employee slip list, mobile salary API, annual statements, approvals, payments, and compensation workflow.
- Attendance Salary Lost and attendance finance analytics calculate from `payrollMonthFor` directly and therefore receive the policy fix without a stored-row refresh.
- Attendance analytics reads attendance facts rather than stored salary money and requires no salary synchronization.

## Database and migrations

None. No schema, migration, SQL, or stored data changes.

## Security and authorization

No permission model changed. The new UI control is visible only to the existing super-admin payable-edit gate, and its server action independently requires existing admin authorization.

## Testing

- `pnpm.cmd vitest run tests/unit/payroll-month.test.ts tests/unit/daily-salary-model.test.ts tests/unit/daily-salary-report.test.ts tests/unit/attendance-worker-config.test.ts` — passed, 193 tests.
- `pnpm.cmd exec eslint lib/attendance/payroll-month.ts lib/salary/day-ledger.ts tests/unit/payroll-month.test.ts tests/unit/daily-salary-report.test.ts` — passed.
- `pnpm.cmd typecheck` — reached Node's default heap limit (exit 134), with no TypeScript diagnostic emitted.
- `node.exe --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit` — passed.
- `pnpm.cmd exec eslint 'app/(app)/salary/page.tsx' components/salary/salary-attendance-refresh-button.tsx` — no errors; one pre-existing `Date.now()` purity warning in the page.

## Deployment and rollback

This branch also contains the reviewed forgotten-punch-out correction recorded in the existing attendance-policy handoff. Production must be promoted only through the approved Altus-OS release workflow. Roll back this change by reverting its isolated commit; no database rollback is required.

## Remaining work

- Push the branch and refresh the existing Vercel preview for stakeholder verification.
- Obtain release approval before merging or promoting to production.
