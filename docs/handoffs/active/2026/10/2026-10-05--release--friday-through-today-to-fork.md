# Production release: Friday through 2026-10-05

Date: 2026-10-05
Release branch: `release/friday-through-2026-10-05`
Destination: `localaltuscorp-os/Altus-OS` (`fork/main`)
Development source: `localaltuscorp-os/wms-local` (`origin/main`)

## Release identity

- Development SHA: `3ed58ae910ed51e00e289e42de4f1e30a31e4088`
- Production base before integration: `e8fd606f`
- Common ancestor: `55a1869a446adcffec3597ec00cc7f3b06ebd81f`
- Integration strategy: merge `origin/main` into a branch created from `fork/main`, preserving the 17 production-only commits and the complete development history.

## Included work

- Development PRs #6 through #14, including contributor integration, CI repair, database permission grants, database-backed Founder authority, task/workflow UI standardisation, Operations invalid-date recovery, task timer positioning, and the Billing product schema repair.
- Friday-through-today development commits already present on `origin/main` at the recorded SHA.

## Conflict decisions

- Kept the newer development `ModuleSectionTitle` implementation instead of the older production title fallback.
- Kept the newer `completeReimbursementRequestFields` implementation instead of the older inline reimbursement fallback.
- Kept the development HR handoff status that records the feature as pushed and integrated.

## Database and migrations

- `0268_billing_product_display_name.sql` is additive and has been applied and verified on the connected `wms-local` database.
- The release contains migrations `0258_dropdown_part1_masters.sql`, `0259_masters_billing_part2.sql`, `0260_salary_rate_root.sql`, and `0263` through `0267` from development.
- `0258_dropdown_part1_masters.sql` and `0259_masters_billing_part2.sql` contain master-data cleanup and must not be batch-applied to a production database without an explicit data review.
- Production database state for the fork must be verified independently before enabling features that depend on the new tables. This release PR does not run database migrations automatically.

## Evidence

- The source SHA passed the required GitHub CI checks on the development PR chain.
- The source SHA lineage was deployed successfully to the `wms-local` Vercel project; the later fixes were also individually verified and merged after green CI.
- The integrated release branch is revalidated after conflict resolution before the production PR is merged.

## Rollback

- Record the final release merge SHA before deployment.
- Roll back application code by redeploying the prior production SHA `e8fd606f`; do not force-push `fork/main`.
- Additive database columns and audit rows should remain in place during application rollback.
