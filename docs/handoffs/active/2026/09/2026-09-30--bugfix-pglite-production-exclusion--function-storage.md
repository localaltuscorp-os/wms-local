# PGlite Production Function-Storage Exclusion

## Date

2026-09-30

## Work item and objective

- Branch: `bugfix/pglite-production-exclusion`
- Objective: retain the local PGlite dummy database while preventing its WASM
  package from being copied into Vercel production functions.

## Status

Implemented and verified locally. Not pushed, merged, deployed, or verified on
the Vercel Usage dashboard.

## Root cause

`lib/db/index.ts` already hides PGlite imports behind variable specifiers, so
compiled production JavaScript contained no resolvable PGlite import. However,
`next.config.ts` still listed `@electric-sql/pglite` unconditionally in
`serverExternalPackages`. Next's production file tracer consequently copied the
external package into `.nft.json` function manifests even without a literal
JavaScript import. The prior leak check inspected JavaScript only and therefore
reported this case as clean.

## Changes

- `next.config.ts`
  - Externalizes PGlite only when `DUMMY_MODE=true` outside production.
  - Production builds now omit it from `serverExternalPackages`.
- `scripts/measure-functions-storage.mjs`
  - `--leaks` now checks NFT deployment traces as well as compiled JavaScript.
  - Any production trace containing PGlite is a failure.
- `tests/unit/db-trace-leaks.test.ts`
  - Guards the environment condition and NFT-trace inspection.

## Database and migrations

None. No local, shared, or production database was modified.

## Security and access

None. Authentication, authorization, credentials, and production configuration
values are unchanged.

## Testing

- `pnpm.cmd exec vitest run tests/unit/db-trace-leaks.test.ts`
  - PASS: 18 tests.
- `pnpm.cmd exec eslint next.config.ts scripts/measure-functions-storage.mjs tests/unit/db-trace-leaks.test.ts`
  - PASS: no errors or warnings.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false`
  - PASS: zero TypeScript errors.
- `pnpm.cmd build`
  - PASS: production build completed successfully.
- `pnpm.cmd check:leaks`
  - PASS: zero literal PGlite imports and zero PGlite NFT traces.
- Direct artifact check
  - `.next/server/**/*.nft.json`: zero files containing `@electric-sql/pglite`.
- `DUMMY_DB_DIR=.pglite-validation pnpm.cmd dummy:setup`
  - Could not start because the host returned `uv_os_get_passwd ENOMEM` after
    the large production build. This was an operating-system memory failure
    before the setup script or PGlite initialized, not a code diagnostic.

## Remaining work and deployment verification

- Deploy only after normal review/authorization.
- Confirm Vercel Usage -> Functions Storage decreases after deployment.
- Run `pnpm dev:dummy` on a machine with available memory to reconfirm the full
  offline workflow, although the source test preserves the local-only external.

## Rollback

Revert the conditional PGlite entry and the associated guard changes. No data
rollback is required.
