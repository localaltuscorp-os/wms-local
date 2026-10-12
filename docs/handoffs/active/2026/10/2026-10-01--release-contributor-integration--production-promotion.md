# Contributor integration production promotion

- **Date:** 2026-10-01
- **Release branch:** `release/contributor-integration-2026-10-01`
- **Objective:** Promote the verified Vinal, Rudra, Shreya, and Om Development integration from `origin/main` to production `fork/main`.
- **Approved Development SHA:** `55a1869a446adcffec3597ec00cc7f3b06ebd81f`
- **Production base / rollback SHA:** `100b6144c994`
- **Status:** Merge prepared for authorized expedited push; full validation deferred by release-owner instruction.

## Scope

- Includes the complete reviewed Development integration, including Vinal precedence over overlapping Rudra phone-input behavior, Shreya ancestry/traceability, and the latest Om workforce/template delivery.
- Preserves the backup-only and holiday release evidence already present on Production.
- Uses a normal merge commit; production history is not rewritten.

## Conflict resolution

- Preserved Production versions of the backup-folder and published-holiday handoffs because they contain completed release evidence.
- Used the Development PGlite handoff because it contains the newer integrated validation record.
- Used the Development holiday/salary regression test because it contains the newer 2026/2027 correction assertions.
- No application-code merge conflicts occurred.

## Database and migration impact

- Adds canonical migrations `0254` through `0262` from Development.
- This Git release does not execute SQL. Apply migrations through the approved production migration process in numeric order before enabling code paths that depend on them.
- Migration rollback requires database-owner review; do not drop additive structures after production data is written.

## Security and access impact

- Includes previously reviewed changes to holiday administration, role expiry, scoped temporary access, compensation approvals, and workforce controls.
- Existing server-side authorization remains in place; no access identity is hardcoded by this release.

## Validation

- `pnpm.cmd typecheck`: PASS.
- Focused contributor/backup suite: 363 passed and 5 failed. The failures are known contract mismatches: three expect the removed Control Panel Users landing and two expect the older module-backup authorization/navigation implementation.
- Optimized production build was started but intentionally stopped before completion when the release owner requested an expedited push and deferred further testing.
- `pnpm check:leaks` was not rerun after the stopped build. The approved Development source previously passed its optimized build and PGlite leak gate, but this exact production merge tree remains to be validated after push.
- Final diff/ancestry/sensitive-data checks are required immediately before push.

## Deployment and rollback

- Push the validated release branch first, then update `fork/main` without force.
- Vercel production deployment is expected to follow `fork/main`; verify the resulting deployment and live health endpoint.
- Do not call this release fully validated until the deferred optimized build, PGlite leak scan, and live deployment checks complete.
- Application rollback: revert the release merge in a new release commit or redeploy production base `100b6144c994`; never force-push.
