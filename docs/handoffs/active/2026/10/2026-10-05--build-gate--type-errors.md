# Build gate type-error fixes

Date: 2026-10-05
Work item: build-gate
Branch: Om

## Objective

Restore TypeScript/build correctness for the reported production build errors.

## Status

Typecheck passed in CI. The first PR test run exposed two catalog/guard consistency failures; both are fixed below. Focused tests pass. Production build remains too resource-intensive to complete locally.

## Changes

- Updated temporary-break toast calls to the current object-based `fireToast` API.
- Made salary-lineage numeric conversion accept unknown database JSON values safely.
- Guarded optional template variants in template configuration and resolution.
- Updated salary-slip test fixture for required salary-rate fields.
- Adapted vendor header test callback to its unknown-input helper contract.
- Restored frozen salary-rate fields on `MySalaryMonth` for payslip data and CI typecheck.
- Restored the approved Dropdown Master routes expected by the current catalog test.
- Tightened destructive-SQL matching so trigger/privilege mentions of `TRUNCATE` are not treated as destructive statements; kept the reviewed cleanup-migration bound explicit.

## Database and migration impact

None.

## Testing

- `node node_modules/vitest/vitest.mjs run tests/unit/drop-down-master.test.ts tests/unit/destructive-sql.test.ts --reporter=dot` — 26/26 pass.
- `node node_modules/typescript/bin/tsc --noEmit` — pass.
- `node node_modules/vitest/vitest.mjs run tests/unit/template-registry.test.ts tests/unit/salary-slip-pdf.test.ts --reporter=dot` — 55/55 pass.
- `node node_modules/vitest/vitest.mjs run tests/integration --no-file-parallelism --reporter=dot` — 33 skipped.
- Full unit suite — 30 failures, 5203 passes, 34 skipped; failures are outside this patch.
- `pnpm check:leaks` — pass before patch; no PGlite leaks.
- Production build — stopped after prolonged high-memory compile; no source diagnostic remained.

## Remaining risks

Full unit failures and local production-build resource usage need separate follow-up.

## Rollback

Revert this commit; no database rollback required.
