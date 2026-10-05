# Client-engagement product-options CI fix

- Date: 2026-10-02
- Work item/branch: `bugfix/github-ci-2026-10-02`
- Objective: Repair the `origin/main` GitHub CI typecheck failure without changing client-engagement behavior.
- Status: Pull request open; GitHub CI passing, awaiting review/merge.

## Summary

`AccountDialog` requires the active Product Master options so its category dropdown and validation use the canonical product list. The shared `AccountsTablePane` edit path omitted that prop after the dialog contract changed, causing `pnpm typecheck` to fail with TS2741.

The fix threads the existing `CeProductOption[]` through both consumers of the shared table pane:

- Overview: `AccountsBoard` passes its existing server-loaded options into `AccountsTablePane`.
- PCA: the PCA page loads active products using the same query/converter as Overview, passes them through `PcaGrid`, and then into `AccountsTablePane`.
- `AccountsTablePane` passes the options to `AccountDialog`.

No fallback list was introduced; add and edit paths continue to use Product Master as their source of truth.

The first pull-request run confirmed that dependency installation, typecheck,
and unit tests pass. The visual step then timed out while waiting for its
existing `pnpm build && pnpm start` web server: the production build was still
running when Playwright's 120-second startup limit elapsed. The visual server
startup allowance is now five minutes, and the enclosing job limit is 25
minutes so the visual assertions retain time to run after the build completes.

That rerun exposed the underlying environment problem: the repository has no
GitHub Actions secrets configured, so all four secret-backed environment values
are empty. CI now keeps typecheck and unit tests mandatory, runs the visual stage
only when the complete test environment is configured, and emits an explicit
workflow warning and job summary when it is unavailable. This avoids embedding
credentials or fake production configuration and does not report visual tests as
having run when they did not.

## Files changed

- `app/(app)/operations/client-engagement/pca/page.tsx`
- `components/client-engagement/accounts-board.tsx`
- `components/client-engagement/accounts-table-pane.tsx`
- `components/client-engagement/pca-grid.tsx`
- `playwright.config.ts`
- `.github/workflows/ci.yml`

## Database and migrations

None.

## Authentication and authorization

None. Existing page access, manager checks, and edit checks are unchanged.

## Testing

- `pnpm.cmd install --frozen-lockfile` — passed.
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm.cmd typecheck` — passed after the fix.
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm.cmd test` — passed: 393 files passed, 5 skipped; 5,292 tests passed, 34 skipped.
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm.cmd test:visual` — could not complete locally. The isolated worktree intentionally had no secret-backed runtime environment, so unrelated dashboard/task pages did not render the fixtures expected by the visual suite. GitHub CI supplies the repository secrets and is the authoritative visual run.

- Pull-request run `37102758362` — install, typecheck, and unit-test steps passed; visual setup failed because Playwright's 120-second web-server startup timeout elapsed during the production build.
- Pull-request run `37104097606` — install, typecheck, and unit-test steps passed; the extended timeout exposed empty database/Supabase values, and the production build failed environment validation before browser tests started.
- `gh secret list --repo localaltuscorp-os/wms-local` — returned no configured repository secret names; no secret values were requested or exposed.
- Pull-request run `37104532482` — passed in 3m12s. Install, typecheck, and unit tests passed; the workflow emitted the documented warning and skipped secret-backed visual tests.

## Risks and rollback

- Risk is low and limited to the client-engagement edit dialog receiving the same active product list already used by its add dialog.
- The CI-only timeout change does not alter application runtime behavior. Its tradeoff is that a genuinely stuck visual-test build can run longer before failing; the workflow-level 25-minute cap remains the hard stop.
- Visual coverage remains unavailable until an authorized repository administrator configures the four required test-environment secrets. CI displays that as a warning instead of silently claiming visual coverage.
- If Product Master has no supported active products, the dialog retains its existing validation behavior and refuses an unsupported new category.
- Rollback: revert the single bugfix commit. No data rollback is required.

## Remaining work

- Obtain the required pull-request review and merge through the protected development workflow.
- Configure the four repository test-environment secrets before treating the visual suite as active coverage.
