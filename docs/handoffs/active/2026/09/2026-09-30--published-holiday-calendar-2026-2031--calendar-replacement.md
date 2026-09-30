# Published holiday calendar replacement handoff

- **Date:** 2026-09-30
- **Branch:** `feature/published-holiday-calendar-2026-2031`
- **Status:** Approved for isolated production promotion; Vercel deployment pending
- **Approved development commit:** `3b4c904764d2b760ca87675650c0df8b54d7baa6`
- **Production release branch:** `release/holiday-calendar-2026-2031`

## Objective

Replace the published company holiday calendar with the supplied authoritative list for 2026 through 2031, so every existing consumer receives the same dates and labels.

## Scope

- Update the static published calendar source consumed by the HR Holiday List, attendance, target-hours, leave/comp-off, payroll-adjacent calendar readers, upcoming-holidays panel, mobile response, and merged company Holiday List.
- Extend the published-year range through 2031 because the supplied list includes 1 January 2031.
- Update calendar contract tests with the supplied dates and labels.
- Keep the Admin/HR `holidays` database table as the existing ad-hoc override and suppression layer; no production database data or migration is changed by this feature.

## Business decision recorded

The supplied calendar replaces the existing published lists, including the 2026 dates already in the past. It is authoritative for all existing holiday consumers.

## Implementation completed

- Replaced the 2026-2028 static entries with the supplied authoritative entries
  for calendar years 2026 through 2031.
- Extended `HOLIDAY_YEARS` and the shared year map through 2031, so the HR
  Holiday List and every existing published-calendar consumer use the same
  data.
- Kept supplied labels exactly, including supplied asterisks.
- Stored the supplied 1 January 2028 row under calendar year 2028 rather than
  2027, so year-based consumers receive the date in its actual calendar year.
- Updated calendar tests for the replacement list, range, labels, override
  suppression, and 2031 look-ahead boundary.

## Validation

- `pnpm exec vitest run tests/unit/holiday-calendar.test.ts tests/unit/holiday-leave-remote-salary-chain.test.ts tests/unit/company-holidays-merge.test.ts tests/unit/adhoc-holiday.test.ts` — passed: 4 files, 107 tests.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck` — passed. The first
  run at the default Node heap exhausted memory before reporting type errors;
  the repository-sized heap completed successfully.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm test` — 5,201 passed, 26 failed,
  34 skipped across 385 files. The 26 failures are the established unrelated
  repository baseline; the focused holiday suites passed and no holiday test
  failed.
- Final scoped diff review completed: only the shared holiday source, its
  focused tests, and this handoff are changed; no SQL, database, deployment,
  authorization, or production files are included.
- `git diff --check` passed. No email or credential patterns were found in the
  tracked source/test diff, and this handoff contains no personal data or
  credentials.
- Production-base focused validation on `fork/main` passed: `pnpm exec vitest
  run tests/unit/holiday-calendar.test.ts
  tests/unit/holiday-leave-remote-salary-chain.test.ts
  tests/unit/company-holidays-merge.test.ts tests/unit/adhoc-holiday.test.ts`
  completed with 4 files and 107 tests passing.
- Production-base `pnpm typecheck` equivalent (`tsc --noEmit` with a 6 GB Node
  heap) passed.
- A local production-build attempt did not reach application compilation
  because Turbopack rejected the isolated worktree's external dependency
  junction. Dependencies were then installed locally, but the subsequent build
  was interrupted before completion. Vercel's production build remains the
  deployment gate and must be verified after the `fork/main` push.

## Production reconciliation follow-up

- The Aura dashboard's holiday card now uses the same merged reader as Attendance instead of reading only `holidays`.
- `scripts/reconcile-published-holidays.ts` provides a transaction-scoped dry run by default and requires `--apply` to mutate data. It upserts the published dates/labels, retires obsolete `holidays` rows, and marks obsolete `event_holidays` rows as not office-closed without deleting audit history.
- Database rollback: restore the affected rows from the JSON dry-run/release evidence (their prior labels and active/office-closed flags). Application rollback is a normal revert of the release commits; no schema migration is involved.
- Production dry-run result: 66 authoritative dates; 12 obsolete active `holidays` rows to retire; 10 obsolete office-closed `event_holidays` rows to retain as records but mark not office-closed. The dry run rolled back without mutation.
- Follow-up validation: focused holiday suites passed (4 files, 107 tests); targeted ESLint passed; TypeScript passed with a 6144 MB heap. The production-base Next.js build completed successfully after loading the local validation environment (compile, TypeScript, page-data collection, and 36 static pages).

## Remaining work

- Push the isolated release commit to `fork/main`; this repository branch is the
  configured Vercel production source and the push should trigger the production
  build automatically.
- Run the verified reconciliation with `--apply`, then verify the active database
  set and the live Attendance/Holiday List output.
- Verify that Vercel reports the deployment as Ready and that the live Holiday
  List shows the replacement calendar.
- No schema migration is required; one controlled data reconciliation is required.
- The full unit-suite baseline still has 26 previously recorded unrelated
  failures. The release owner explicitly approved this isolated holiday-only
  promotion based on the focused tests and typecheck above.

## Deployment and rollback

- Scope: approved development commits `3b4c9047` and `71d75215`; no other
  unreleased `origin/main` commits are included.
- Deployment trigger: normal, non-force push to `fork/main`; Vercel builds and
  promotes that branch automatically.
- Database/migrations: no schema migration. The reconciliation preserves rows,
  deactivates obsolete admin holidays, and clears office-closed only on obsolete
  event holidays.
- Rollback: revert the production release commit on a new release branch, run
  the focused holiday tests, and normally push the resulting revert to
  `fork/main`. Restore the recorded prior database flags/labels if a data rollback
  is required. Do not force-push or rewrite production history.
