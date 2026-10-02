# Client Engagement product-option build repair

- **Date:** 2026-10-02
- **Work item:** `bugfix/client-engagement-product-options`
- **Status:** Pushed for development review; PR open
- **Commit:** `ccb94013` (`fix(client-engagement): pass product options to account editor`)
- **Branch:** `origin/bugfix/client-engagement-product-options`
- **Pull request:** #5, base `main`, not merged

## Objective

Resolve the development build TypeScript error caused by an Account Dialog call that omits its required active product options.

## Planned change

Passed the existing active-product option list through the shared account-table pane from both Client Engagement overview and PCA entry points. The PCA server page now uses the same existing active-product query and option mapper as the overview page.

## Scope and safety

- No database or migration changes.
- No authorization, role, permission, or access-model changes.
- No production, Vercel, or GitHub configuration changes.
- No real-person data, credentials, or secrets.

## Validation

- `pnpm exec vitest run tests/unit/ce-v2.test.ts` passed: 25 tests in 1 file.
- `pnpm test` passed: 393 test files and 5,292 tests passed; 5 files and 34 tests skipped.
- Targeted ESLint for the four changed source files passed.
- Repository-wide `pnpm lint` reported zero errors but exited non-zero because of 410 existing warnings in unrelated files. No warning was reported from the changed source files.
- Full TypeScript validation required the production-sized 6 GB Node heap because the default heap exhausted without reporting a code error. The 6 GB run completed with no TypeScript output or error.
- `pnpm build` compiled successfully and reached the TypeScript phase without the original missing-prop error. Its final local output-processing stage became idle, so it was stopped without being treated as a completed build. Existing non-fatal NFT tracing warnings from `next.config.ts` were emitted.
- `git diff --check` passed.

## Remaining work

- Review and resolve the PR checks before merging to `origin/main`.
- Run or observe a complete production build in an environment with sufficient resources before any production promotion.
