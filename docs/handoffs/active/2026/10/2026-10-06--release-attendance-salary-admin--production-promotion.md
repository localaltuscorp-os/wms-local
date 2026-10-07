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

## Hourly monthly-target correction

- Follow-up objective: hourly staff must earn their configured monthly anchor when they complete that specific month's eligible target. Example: a monthly anchor of 3,500 and a September target of 115h produces a rate of `3500 / 115`, not `3500 / 30 calendar days / 5 scheduled hours`.
- Root cause: `computeHourlySalary` correctly selected `eligibleTargetHours`, then replaced that rate whenever `workingHoursPerDay` was present. Production therefore priced the observed September month against 150h instead of 115h.
- `lib/salary/compute.ts` now always divides by the guarded eligible monthly target. Sparse/invalid target data still falls back to the calendar target.
- Approved unpaid-leave hours are added back only to the rate denominator so LWP cannot raise the rate and erase its own deduction; company holidays remain excluded and therefore do not reduce the monthly anchor.
- `lib/salary/generate.ts` passes the already-derived unpaid-leave day count into the hourly calculation.
- Regression coverage includes the exact 3,500 / 115h September case with a 5h schedule, holiday-adjusted rates, sparse-target fallback, overtime, and unpaid leave.
- Existing whole-hour payroll policy remains unchanged: precise worked minutes stay visible in attendance, while money uses completed whole hours.
- Database impact: none. No migration or data update is required; recalculation refreshes stored runs through the existing authorized flow.
- Security/access impact: none.
- Validation: focused ESLint passed; full TypeScript check passed; 244 tests across 8 salary/attendance suites passed; `git diff --check` passed; the diff contains no new secrets or hardcoded identities.
- Deployment plan: fast-forward the focused commit to `origin/main`, deploy Vercel production, confirm Ready, then inspect runtime logs. Existing September rows must be recalculated to persist the new amount across My Salary, Accounts Salary, and Salary Slip.

## Missing latest completed salary month

- Follow-up objective: make the latest completed payroll month available on My Salary even when no salary run was previously materialised for that employee.
- Root cause: `loadMySalaryMonths` refreshed only the current open month, then built the month selector solely from already-stored salary runs and legacy breakup rows. In October, a missing September run could therefore leave the employee seeing August, July, and an older imported month.
- `lib/salary/my-salary.ts` now asks the existing payroll engine to materialise the immediately preceding month when it is missing, before loading the selector rows. It still refreshes the current month as before.
- `lib/salary/period.ts` adds pure previous-month arithmetic, including the January-to-December boundary.
- The refresh remains fail-soft and profile-driven. It does not invent employee compensation data, overwrite payment-status fields, or hardcode an employee identity.
- Database impact: no schema change. A missing `salary_runs` row and its existing breakup mirror may be created through the normal salary calculation path when a valid salary profile exists.
- Security/access impact: none; the existing page authorization and salary engine are unchanged.
- Validation: focused salary tests passed (42 tests across 3 files); full TypeScript check passed; focused ESLint passed. The full-repository lint attempt exceeded the 120-second command limit before returning a result.
- Rollback: redeploy the prior application commit. Rows created by a valid calculation can remain because older code already reads them; no destructive database rollback is required.

## Unconfigured hourly salary visibility

- Follow-up objective: stop the Salary Breakup admin from presenting an unsaved hourly salary as a configured 3,500 value.
- Root cause: `listSalaryProfiles` converted a null `monthly_pay_at_target` to 3,500 for display, while payroll correctly inspected the raw nullable value. The edit dialog also prefilled 3,500 for null rows. This made incomplete profiles look valid even though generation returned `no-profile`.
- The query now exposes 0 for the legacy numeric display field while preserving `monthlyPayAtTargetRaw = null`; the Salary Breakup list, sort, configured count, and edit form use the raw saved value.
- An unset hourly profile now shows `Not configured`, is excluded from `With pay set`, and opens with a blank Monthly Pay at Target field. A saved 3,500 remains 3,500.
- Database impact: none. Existing salary-profile values are neither backfilled nor changed.
- Security/access impact: none; the screen remains admin-only and payroll authorization is unchanged.
- Validation: TypeScript passed; 16 focused salary tests passed across 2 files; focused ESLint completed with zero errors and three pre-existing React effect warnings in the touched components.
- Rollback: redeploy the prior application commit; no data rollback is needed.

## Employee Master shift-type save

- Follow-up objective: allow the single-employee Employee Master to save a Shift Type change such as Hybrid.
- Root cause: the workspace included `workerType` in its sparse patch, but `EditEmployeeSchema` omitted that key. Strict validation rejected the request before any database write with `Unrecognized key: workerType`.
- `EditEmployeeSchema` now accepts the canonical worker-type enum, and `editEmployee` writes it through its existing admin-only, audited path.
- Because worker type determines payroll basis, the employee row and the derived `salary_profiles.pay_type` are updated in one database transaction. Existing salary amounts, tax settings, and target values are preserved.
- Database impact: no schema migration. A successful admin save changes the selected employee's `employees.worker_type` and the corresponding derived `salary_profiles.pay_type`.
- Security/access impact: none; `requireAdmin` and the existing audit records remain in force.
- Validation: TypeScript passed; 65 focused Employee Master/editor tests passed across 2 files; focused ESLint passed; `git diff --check` passed.
- Operational note: no direct production employee update was executed from the development workspace. After deployment, the authorized admin must submit the Employee Master save so the production write is authenticated and audited.
- Rollback: select the prior Shift Type through Employee Master if the data choice was wrong; application rollback is a redeploy of the prior commit without history rewriting.
