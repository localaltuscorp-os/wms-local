# Client-engagement product-options CI fix

- Date: 2026-10-02
- Work item/branch: `bugfix/github-ci-2026-10-02`
- Objective: Repair the `origin/main` GitHub CI typecheck failure without changing client-engagement behavior.
- Status: Implemented and locally verified; branch push/CI confirmation pending.

## Summary

`AccountDialog` requires the active Product Master options so its category dropdown and validation use the canonical product list. The shared `AccountsTablePane` edit path omitted that prop after the dialog contract changed, causing `pnpm typecheck` to fail with TS2741.

The fix threads the existing `CeProductOption[]` through both consumers of the shared table pane:

- Overview: `AccountsBoard` passes its existing server-loaded options into `AccountsTablePane`.
- PCA: the PCA page loads active products using the same query/converter as Overview, passes them through `PcaGrid`, and then into `AccountsTablePane`.
- `AccountsTablePane` passes the options to `AccountDialog`.

No fallback list was introduced; add and edit paths continue to use Product Master as their source of truth.

## Files changed

- `app/(app)/operations/client-engagement/pca/page.tsx`
- `components/client-engagement/accounts-board.tsx`
- `components/client-engagement/accounts-table-pane.tsx`
- `components/client-engagement/pca-grid.tsx`

## Database and migrations

None.

## Authentication and authorization

None. Existing page access, manager checks, and edit checks are unchanged.

## Testing

- `pnpm.cmd install --frozen-lockfile` — passed.
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm.cmd typecheck` — passed after the fix.
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm.cmd test` — passed: 393 files passed, 5 skipped; 5,292 tests passed, 34 skipped.
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm.cmd test:visual` — could not complete locally. The isolated worktree intentionally had no secret-backed runtime environment, so unrelated dashboard/task pages did not render the fixtures expected by the visual suite. GitHub CI supplies the repository secrets and is the authoritative visual run.

## Risks and rollback

- Risk is low and limited to the client-engagement edit dialog receiving the same active product list already used by its add dialog.
- If Product Master has no supported active products, the dialog retains its existing validation behavior and refuses an unsupported new category.
- Rollback: revert the single bugfix commit. No data rollback is required.

## Remaining work

- Push the branch and let GitHub Actions run the full CI workflow.
- Merge only after the secret-backed GitHub visual stage passes.
