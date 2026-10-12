# October 7–8 development merges to Altus-OS main

- Date: 2026-10-09
- Branch: `release/october-7-8-merges`
- Objective: Open a release PR against `localaltuscorp-os/Altus-OS` `main` containing development PRs merged since 2026-10-07.
- Status: Integrated and validated locally; awaiting Altus-OS PR review.

## Release lineage

- Altus-OS main base: `564956673a517bb847abc67d5f02dcb846e68eed`
- Development main promoted: `a791ddf999ed3802cc2e722f26b357d724230c8a`
- Common ancestor before integration: `3ed58ae910ed51e00e289e42de4f1e30a31e4088`
- Integration commit: `b0f931cb`
- Altus-only history was preserved by merging development main into a branch created from Altus-OS main.

## Development PRs included

- #17 — group hidden roles by module
- #18 — refine approvals and HR navigation
- #19 — incentive bulk request upload and billing compliance file support
- #20 — HR console, directory, and local approvals fixes
- #21 — directory registration, CTC approvals, and attendance sessions

## Database migrations required before/with release

- `db/migrations/0268_billing_entity_compliance_files.sql`
- `db/migrations/0269_vendor_registration_forms.sql`
- `db/migrations/0270_attendance_three_daily_sessions.sql`

These migrations were reviewed but were not executed against the Altus production database during PR preparation. Migration 0270 intentionally removes the former one-in/one-out-per-day unique index so the application can store up to three attendance sessions.

## Validation

- `pnpm.cmd typecheck` — passed.
- `pnpm.cmd test` — 402 files passed, 5 skipped; 5,336 tests passed, 34 skipped.
- `pnpm.cmd build` — compilation and build TypeScript passed; page-data collection stopped because this checkout lacks `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `pnpm.cmd check:leaks` — passed; zero watched-package leaks, including zero PGlite traces.
- Integration merge completed without conflicts.

## Deployment and rollback

- Opening the PR does not deploy or modify Altus-OS main.
- Apply the three migrations through the approved production migration process when the release is approved.
- Code rollback: revert the eventual Altus-OS merge commit.
- Database rollback needs feature-specific review; migration 0270 changes uniqueness semantics and should not be reversed while multiple same-kind daily punch rows exist.
