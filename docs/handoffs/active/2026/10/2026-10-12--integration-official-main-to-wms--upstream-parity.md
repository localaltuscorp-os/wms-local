# Official main integration into wms-local

## Date

2026-10-12

## Objective

Bring `wms-local` up to parity with the official production source,
`Altus-corp/Altus-OS` `main`, after a Policies UI comparison showed that the
previously configured fork was not the repository serving `os.altuscorp.in`.

## Status

Integration merge resolved locally; pending pull-request CI and review.

## Source and destination

- Source: `Altus-corp/Altus-OS` `main` at `fc8eaf6e`.
- Destination base: `localaltuscorp-os/wms-local` `main` at `961f4aba`.
- Integration branch: `integration/official-main-to-wms-2026-10-12`.

## Included work

- Policies: three additional firm policies, policy creation, private draft
  management, editor updates, signing and download behavior.
- Attendance, payroll, salary, access, hierarchy, email, and related upstream
  improvements included in the official-main merge.
- Merge conflicts were limited to attendance grading and build scripts.
  Multi-session worked-minute support from `wms-local` is retained; an unclosed
  session becomes absent after the day closes, matching the official attendance
  policy. The production build command uses the official 4 GB Webpack setting.

## Database and migrations

No new canonical migration files are introduced by this integration. Existing
database data still determines policy signatures, uploaded documents, and
employee permissions.

## Validation

- `pnpm vitest run tests/unit/policies-workspace-signed.test.tsx tests/unit/policy-access.test.ts tests/unit/policy-custom-category.test.ts tests/unit/policy-file-name.test.ts tests/unit/attendance-status.test.ts tests/unit/attendance-auto-half-day.test.ts tests/unit/forgotten-logout.test.ts`
  passed: 7 files, 51 tests.
- `pnpm typecheck` exhausted Node's default 2 GB heap without a compiler
  diagnostic.
- Retried with `NODE_OPTIONS=--max-old-space-size=4096`; no diagnostic was
  emitted before the local command monitoring window elapsed. Pull-request CI
  must complete the required full check.

## Deployment and rollback

Do not deploy until the integration PR's required `test` check is green and the
PR is explicitly approved for merge. Rollback is the normal GitHub revert of
the resulting merge commit.
