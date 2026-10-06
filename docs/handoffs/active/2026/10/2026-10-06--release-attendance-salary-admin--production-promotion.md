# Attendance, salary and admin production promotion

- Date: 2026-10-06
- Source branch: `bugfix/forgotten-punchout-absent-altus-os`
- Production repository: `Altus-corp/Altus-OS`
- Objective: Promote the reviewed attendance, salary reconciliation, and admin hierarchy fixes completed on 2026-10-06.
- Approval: Release-owner authorization was provided in the active task before promotion.
- Status: Application commits promoted to production `main`; migration 0260 and production deployment blocked on database access.

## Approved commit range

- Base: `3f8b470e`
- Reviewed source head before this release record: `921f965e`
- The base is the merge-base and direct ancestor of the source head; promotion is fast-forward only.

The range contains the forgotten-punch-out absence behavior, half-day waiver payroll correction, Accounts attendance refresh, self-only salary reconciliation, admin hierarchy schema compatibility, focused tests, and their task handoffs.

## Database and migration

- Runtime evidence from the Ready preview showed PostgreSQL SQLSTATE `42703` for the missing `salary_runs.monthly_salary` column.
- Canonical fix: `db/migrations/0260_salary_rate_root.sql`.
- Migration 0260 is additive and idempotent. It adds three nullable salary-rate columns and performs no backfill or repricing.
- Apply only 0260 through the single-migration runner and record it in `__schema_applied`; do not run the full pending migration set.

## Security and authorization

- Existing attendance, salary-view, admin, and self-only authorization boundaries remain in place.
- No credentials, tokens, or personal identifiers were added by the release diff.
- The final diff was scanned for common credential and hardcoded-identity patterns.

## Release checks

- Focused ESLint: completed with zero errors and one pre-existing React purity warning in `app/(app)/salary/page.tsx` for `Date.now()`.
- `$env:NODE_OPTIONS='--max-old-space-size=4096'; pnpm.cmd typecheck`: passed.
- Focused Vitest suite: passed, 132 tests across 5 files.
- `git diff --check origin/main...HEAD`: passed.
- Vercel preview for source head `921f965e`: Ready.
- Local `pnpm build`: exceeded the 10-minute local timeout during webpack compilation; no compiler error was reported.
- `pnpm check:leaks`: could not run because the timed-out local build did not leave `.next/server`. No database bootstrap, dependency, Next configuration, or function-tracing files changed in this release.

## Deployment verification

After promotion:

1. Confirm `origin/main` contains the exact release head.
2. Apply and verify only migration 0260.
3. Deploy `origin/main` to Vercel production without force-push.
4. Confirm the production deployment is Ready.
5. Verify `/my-salary`, `/salary`, `/admin/hierarchy`, and `/admin/employee-master` respond; authenticated business verification remains required for salary figures.

## Promotion and database preflight result

- `origin/main` was fast-forwarded without force-push from `3f8b470e` to release commit `138f9267`.
- Pushing `main` did not trigger an automatic Vercel production deployment; the last Ready production deployment remains the earlier release.
- Vercel runtime logs proved the configured runtime database lacks `salary_runs.monthly_salary` (`42703`).
- Production secrets are protected and cannot be exported through `vercel env pull`; no secret value was exposed and the temporary environment file was deleted.
- The Supabase project currently visible to the authenticated CLI already has `monthly_salary`, so it does not match Vercel's runtime failure and was not modified.
- The previously documented Vercel Supabase project could not be linked because the authenticated account lacks the required project privileges. Migration 0260 was therefore not applied anywhere.
- Do not deploy the new `main` build to production until access to the Vercel-linked database is restored and migration 0260 is applied and verified.

## Rollback

- Application rollback: redeploy the prior production commit. Do not rewrite Git history.
- Database rollback is normally unnecessary because the new columns are nullable and unused by the prior application. Dropping them would be destructive and is not part of routine rollback.
