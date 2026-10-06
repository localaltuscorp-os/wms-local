# Salary Layer 2 deductions

## Completed

- Audited the generated salary deduction chain and recorded sources, inputs,
  formulas, stored fields, and net-pay entry points in
  `SALARY_FINANCIAL_LINEAGE_AUDIT.md`.
- Preserved the canonical generated-run formula:
  `gross - pt - tds - advances + pending_balance_in`.
- Kept absence/LWP and half-day reductions inside authoritative attendance
  payable values; no second salary subtraction was introduced.
- Confirmed live generation disables the historical late-mark half-day rule.
- Changed manual wave-off pricing to require actual `days_in_month`; malformed
  rows receive no automatic 30-day fallback add-back.
- Required a note for every nonzero manual wave-off or signed payout adjustment.
- Exposed those manual register overlays and their notes in the read-only salary
  lineage view, separate from generated deductions.
- Added synthetic August, 31-day, 8-hour, 5,000/month regression coverage for
  daily/full-time and hourly/intern paths, absence, half day, two-hour
  shortfall, overtime, overtime plus unpaid day, and PT/TDS/advance/pending.

## Changed files

- `lib/salary/waive-off.ts`
- `app/(app)/salary/actions.ts`
- `lib/queries/salary-lineage.ts`
- `components/admin/salary-lineage-view.tsx`
- `tests/unit/salary-rate-root.test.ts`
- `tests/unit/salary-payment.test.ts`
- `SALARY_FINANCIAL_LINEAGE_AUDIT.md`

## Validation

- Focused salary deductions: 5 files, 93 tests passed.
- Broad salary/payroll suite: 15 files passed; 4 failures in
  `salary-statement-render.test.tsx` expect the old `₹` formatter while the
  shared formatter currently returns `Rs.`. These failures do not execute the
  deduction changes.
- `tsc --noEmit` completed with no emitted diagnostics.
- `git diff --check` passed for Layer 2 files.

## Known policy boundary

- Generated PT authority is the existing `isPtExempt()` pay-path policy;
  `salary_profiles.pt_exempt` remains a legacy/import representation.
- Current `salary_advances` is a current-month sum, not an outstanding-balance
  repayment engine.
- `salary_adjustments` and V2 pro-ration utilities do not write current
  `salary_runs` / `salary_breakup` values.
