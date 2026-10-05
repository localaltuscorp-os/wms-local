# HR Directory — Vendors and HR Consultants

- Date: 2026-10-02
- Work item: `hr-directory`
- Status: Implemented locally; the additive database migration awaits normal release-owner application outside dummy mode.

## Objective

Add a secure Directory directly under the HR Dashboard, with separate Vendor and HR Consultant tabs, primary and secondary contact details, quick communication actions, and complete-directory export options.

## Changes

- Added `/hr/directory`, its HR navigation entry directly after Dashboard, and a staff-dashboard Directory card.
- Reused the existing `hr_contacts` register instead of creating duplicate vendor/contact data. New fields classify a record as `vendor` or `hr_consultant` and hold the secondary contact name, cell, and email.
- Added an in-place Add/Edit/Archive directory table. Both tabs show serial number, name, company, primary contact, email, Contact 2, and action buttons.
- Primary and secondary cell fields include direct telephone, WhatsApp, and email actions when the relevant data exists.
- Added complete active-directory CSV download, PDF download, and email-PDF-to-the-signed-in-HR-user. The email action never accepts a client-provided email address, avoiding an authenticated open relay.
- Added synthetic dummy Vendor and HR Consultant entries only; no real contact information was introduced.

## Files

- `app/(app)/hr/directory/page.tsx`
- `app/(app)/hr/directory/actions.ts`
- `components/hr/directory/hr-directory.tsx`
- `lib/hr/directory.ts`
- `lib/hr/registers-server.ts`
- `db/schema.ts`
- `db/migrations/0267_hr_directory_contacts.sql`
- `lib/hr/console-nav.ts`
- `components/hr/hr-landing.tsx`
- `scripts/dummy-db-seed.ts`

## Database and access

- Migration `0267_hr_directory_contacts.sql` is additive: four columns and an index on `hr_contacts`; legacy records default to Vendors.
- It was applied only by `pnpm dummy:reset` to disposable PGlite. Do not apply it to a remote database without the normal migration/release approval.
- `/hr/directory` and all mutation/export-email actions use the existing `requireHrStaff` guard. Non-HR staff cannot access the directory.

## Validation

- Focused ESLint passed for the new page, actions, component, schema, server query, navigation, and test (with one unrelated pre-existing warning in `components/hr/hr-landing.tsx`).
- `pnpm exec vitest run tests/unit/hr-directory.test.ts tests/unit/hr-registers.test.ts`: 12 tests passed.
- `pnpm dummy:reset` applied 342 migrations and seeded 4 synthetic `hr_contacts` rows.
- Fresh dummy server check: `GET http://localhost:3002/hr/directory` returned HTTP 200.
- Isolated production build (`NEXT_DIST_DIR=.next-build-test pnpm build`) succeeded and lists `/hr/directory`.
- `git diff --check` passed.
- `pnpm check:leaks` could not run because it is hard-coded to `.next/server`, while `.next` is owned by the running normal dev server. The completed isolated build is in `.next-build-test` and did not report a PGlite leak; rerun the repository command after a normal non-dev-server build before release.

## Rollback

Remove the Directory route/UI/nav entries and stop using the new fields. The migration is additive; leave the columns in place unless a release owner plans a separate, data-aware rollback.
