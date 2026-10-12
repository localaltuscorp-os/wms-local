# Altus main to wms-local main sync

## Objective

Bring the commits present on `localaltuscorp-os/Altus-OS` `main` into the development repository `localaltuscorp-os/wms-local` without overwriting the newer development commits.

## Branches and commits

- Source: `fork/main` at `2aad0b9d8e466842abf15585c771fce5d20bc2aa`
- Development base: `origin/main` at `6cbd5af94d03d97bbdfcee95f079af8b73d6c634`
- Integration branch: `integration/altus-main-to-wms-2026-10-12`
- Merge commit: `4eae4ff7`
- Common ancestor before the merge: `a791ddf999ed3802cc2e722f26b357d724230c8a`

## Result

- Merged the complete Altus main history into the latest wms-local main history using a normal merge commit.
- Preserved the eight development-only commits that were already on wms-local main.
- The net tree changes from the Altus side are `.vercelignore` and release/handoff documentation. The promoted application commits were already shared by both histories.
- No database migrations, schema changes, runtime authorization changes, or production deployment are part of this sync.

## Validation

- Merge completed without conflicts.
- `git diff --check origin/main...HEAD` passed.
- Required repository checks must pass on the latest branch SHA before merge.

## Rollback

Do not rewrite shared history. If the integration is merged and must be undone, revert the merge commit through a reviewed pull request.

## Next steps

1. Run TypeScript validation and unit tests.
2. Push the integration branch to `origin`.
3. Open a pull request targeting `origin/main`.
4. Monitor the required `test` check on the latest head SHA until terminal.
