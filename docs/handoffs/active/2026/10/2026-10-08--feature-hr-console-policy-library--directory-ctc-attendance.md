# Directory, CTC approvals, global navigation, and attendance sessions

- Date: 2026-10-08
- Branch: `feature/directory-ctc-attendance`
- Status: Ready to push for development review. Do not merge without the required
  GitHub `test` check passing on the pushed head commit and explicit approval.

## Objective

Complete the requested shared module-navigation behavior, expand the HR
Directory with secure vendor registration, expose read-only CTC breakups in
Admin Approvals, and support up to three attendance check-in/check-out pairs
per employee per local calendar day.

## Implementation summary

- Shared chrome now provides a compact full-width module row for non-Hub
  modules. It appears when its edge hover region is used and does not alter the
  existing sidebars. Hub keeps only its logo and local navigation.
- The HR Directory has compact, pinned core columns and per-record registration
  links. Vendor, HR consultant, and employee views share the requested
  directory layout; synthetic preview data is limited to local preview mode.
- Public vendor-registration links are 30-day, random, hashed tokens. A valid
  link can submit the requested contact, bank, GST, alternate-contact, and
  attachment metadata only for its associated vendor record. HR staff create
  or reissue links from the authenticated Directory action.
- Admin Approvals has a read-only CTC Breakup tab. It reads existing CTC
  versions and component values and links to the existing HR CTC workspace;
  it does not introduce a new approval or write path.
- Attendance events are paired in chronological order. A user can start up to
  three alternating pairs per local day. Completed work is summed for the day;
  a pair crossing midnight is apportioned at local midnight so the next day
  receives only its post-midnight duration. Auto-out and administrator updates
  now use the latest punch event, rather than assuming one pair per day.

## Files and data impact

- Navigation and layout: `components/layout/aura-top-bar.tsx`,
  `components/layout/chrome-shell.tsx`, `components/layout/module-footer.tsx`,
  `components/layout/sidebar-rail.tsx`, and `app/globals.css`.
- Directory and registration: `app/(app)/hr/directory/*`,
  `app/vendor-registration/[token]/*`, `components/hr/directory/*`,
  `lib/hr/registers-server.ts`, and `lib/hr/vendor-registration.ts`.
- CTC approvals: `app/(admin)/admin/approvals/page.tsx`,
  `components/admin/approvals/{approval-workbench,ctc-breakup-tab}.tsx`, and
  `lib/hr/ctc/approval-list.ts`.
- Attendance: `app/(app)/attendance/*`,
  `app/api/cron/attendance-autoout/route.ts`, `lib/attendance/*`, and
  `lib/queries/attendance*`.
- Schema/migrations: `db/schema.ts`,
  `db/migrations/0269_vendor_registration_forms.sql`, and
  `db/migrations/0270_attendance_three_daily_sessions.sql`.

Migration 0269 is additive to `hr_contacts` and creates
`vendor_registration_links` with hashed tokens. Migration 0270 removes the
former unique attendance event-per-kind index and adds an employee timeline
index, enabling the application-enforced three-session limit. Apply both only
through the approved development/release migration process; they were not
applied to a shared or production database during this work.

## Security and access

- Directory mutations and link issuance keep the existing `requireHrStaff`
  authorization and rate limiting.
- Public registration has no dashboard login requirement, but requires a
  256-bit random, hashed, unexpired token scoped to one vendor record.
- CTC approvals are read-only and retain the existing admin page access model.
- No credentials, production identifiers, or non-synthetic personal data were
  added.

## Validation

- `node_modules\\.bin\\tsc.cmd --noEmit` — passed.
- `node_modules\\.bin\\vitest.cmd run` — passed: 402 files, 5,335 tests;
  5 files and 34 tests skipped.
- `node_modules\\.bin\\next.cmd build` with a 4 GB Node heap — passed.
- `node scripts/measure-functions-storage.mjs --leaks` — passed: zero PGlite
  trace leaks across 4,165 built server files.
- `git diff --check` — passed.
- A full `eslint .` attempt exceeded the local four-minute command window
  without diagnostics. Focused linting of the files changed during this work
  passed earlier; rerun the repository lint command in CI or an unrestricted
  environment if a full lint result is required.

## Known follow-up and rollback

- The migrations must be applied before live vendor-registration persistence or
  multiple same-day attendance pairs are available outside local test data.
- Production deployment and migration application require release-owner
  approval. No production changes have been made.
- Roll back application behavior by reverting this task commit. Both migrations
  are forward-only and additive except for the replaced attendance index; do
  not drop new data columns or tables without a data-aware rollback plan.

## Commit handoff

The pending commit should include only the source, migration, test, and this
handoff file. Local build directories, dummy storage, and the screenshot are
intentionally excluded.
