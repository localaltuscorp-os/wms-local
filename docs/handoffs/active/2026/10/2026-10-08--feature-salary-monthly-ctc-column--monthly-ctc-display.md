# Monthly CTC display on Salary payroll table

- Date: 2026-10-08
- Branch: `feature/salary-monthly-ctc-column`
- Status: ready for review/release approval

## Objective

Show the fixed monthly salary snapshot on the Accounts Salary payroll table, separate from the attendance-adjusted payable amount.

## Change

- Added a read-only **Monthly Salary (CTC)** column after Entity in `components/salary/salary-breakup-table.tsx`.
- The column uses the existing `salary_breakup.monthly_ctc` value already fetched and passed to the table for the selected payroll month.
- It can be sorted and is included in the table total.
- No payroll calculation, write action, permissions, database query, or schema changed.

## Meaning of the displayed figures

- **Monthly Salary (CTC):** fixed monthly salary snapshot for that payroll month.
- **Payable:** attendance/deduction-adjusted amount.
- **Final Amount:** payable after authorised adjustments.
- **Amount to Pay:** amount recorded as paid.

## Validation

- `git diff --check` passed.
- `node --max-old-space-size=4096 ../../node_modules/typescript/bin/tsc --noEmit` was attempted. It reached a pre-existing repository dependency error: `lib/email/transport.ts` cannot resolve `nodemailer`. The salary change did not produce a TypeScript diagnostic.
- No focused test covers the payroll table column configuration.

## Database and security impact

None. The column uses existing data and keeps the current Finance access gate unchanged.

## Release and rollback

- Release: merge the approved feature commit to `Altus-corp/Altus-OS` `main` and allow/deploy the production build.
- Rollback: revert the feature commit; no migration or data rollback is required.
