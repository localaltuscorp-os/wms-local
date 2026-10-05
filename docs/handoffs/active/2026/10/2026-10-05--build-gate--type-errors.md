# Build gate type-error fixes

Date: 2026-10-05
Work item: build-gate
Branch: main

## Objective

Restore TypeScript/build correctness for the reported production build errors.

## Status

Typecheck passes. Focused template and salary-slip tests pass. Full unit suite still has unrelated behavioral failures. Production build remains too resource-intensive to complete locally.

## Changes

- Updated temporary-break toast calls to the current object-based `fireToast` API.
- Made salary-lineage numeric conversion accept unknown database JSON values safely.
- Guarded optional template variants in template configuration and resolution.
- Updated salary-slip test fixture for required salary-rate fields.
- Adapted vendor header test callback to its unknown-input helper contract.

## Database and migration impact

None.

## Testing

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
