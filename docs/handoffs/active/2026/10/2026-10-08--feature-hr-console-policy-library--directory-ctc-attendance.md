# HR, Accounts, policy, onboarding, and approvals updates

- Date: 2026-10-08
- Branch: `feature/directory-ctc-attendance`
- Status: Ready to push for development review. Do not merge without the required
  GitHub `test` check passing on the pushed head commit and explicit approval.

## Objective

Complete the requested HR Directory and vendor-registration flow, employee
policy letterheads, onboarding form and approval workflow, Accounts MIS and
Payments workspaces, CTC approval decisions, shared navigation behavior, and
attendance sessions.

## Implementation summary

- Shared chrome now provides a compact full-width module row for non-Hub
  modules. It appears when its edge hover region is used and does not alter the
  existing sidebars. Hub keeps only its logo and local navigation.
- Accounts exposes separate MIS and Payments workspaces from its index. MIS
  provides the requested financial tracker tabs; Payments provides
  Reimbursements, Incentives, Salary, Overtime, and Company Expenses tabs that
  route to the existing source modules rather than duplicating their data.
- The HR Directory has compact, pinned core columns and per-record registration
  links. Employee rows derive their contact, personal-email, and emergency
  contact details from submitted onboarding data. Vendor, HR consultant, and
  employee views share the requested directory layout; synthetic preview data
  is limited to local preview mode.
- Public vendor-registration links are 30-day, random, hashed tokens. A valid
  link can submit the requested contact, bank, GST, alternate-contact, and
  attachment metadata only for its associated vendor record. HR staff create
  or reissue links from the authenticated Directory action.
- Admin Approvals has CTC Breakup and Onboarding tabs with matching compact
  tables: serial number, employee, purpose, source details, Yes/No approval
  controls, and decision notes. Each record occupies one table row. CTC
  component details open in a dialog instead of expanding the row; onboarding
  source forms open from the notes cell.
- Both CTC and Onboarding support ascending/descending sorting and drag-to-
  reorder columns, while retaining the serial-number column at the left.
- The Onboarding tab derives its rows from submitted onboarding forms, shows
  completed-section and attachment counts, and records approval decisions in
  a dedicated audited workflow table.
- CTC decisions use the existing audited approval action and Super Admin
  authorization. CTC is deliberately excluded from Accounts payments: it is a
  compensation-authorisation decision, not a payment instruction.
- Attendance events are paired in chronological order. A user can start up to
  three alternating pairs per local day. Completed work is summed for the day;
  a pair crossing midnight is apportioned at local midnight so the next day
  receives only its post-midnight duration. Auto-out and administrator updates
  now use the latest punch event, rather than assuming one pair per day.
- Onboarding now has a compact name/back header with Quick access section
  links. Personal Details has three dropdowns for Date of Birth in
  `DD-MMM-YYYY` format, a one-line date/phone/selfie/CV layout, and all
  phone-number fields normalise and validate exactly 10 digits in both client
  and server submission paths.
- Policy pages and PDF downloads resolve the current employee's assigned
  paying entity, applying that entity's letterhead and company-name
  substitutions consistently. Employees can no longer choose an unrelated
  company from the policy view.

## Files and data impact

- Navigation and layout: `components/layout/aura-top-bar.tsx`,
  `components/layout/chrome-shell.tsx`, `components/layout/module-footer.tsx`,
  `components/layout/sidebar-rail.tsx`, and `app/globals.css`.
- Directory and registration: `app/(app)/hr/directory/*`,
  `app/vendor-registration/[token]/*`, `components/hr/directory/*`,
  `lib/hr/registers-server.ts`, and `lib/hr/vendor-registration.ts`.
- Onboarding and directory projection: `components/dossier/onboarding-form.tsx`,
  `lib/dossier/{onboarding-schema,onboarding-submit}.ts`,
  `lib/hr/employee-directory.ts`, and `lib/hr/directory.ts`.
- Accounts: `app/(app)/accounts/{page,mis,payments,approvals}/*`,
  `components/accounts/{accounts-index,mis,payments,compensation-payments}.tsx`,
  and `lib/accounts/{access,sections,mis,payments}.ts`.
- Policies: `app/(app)/hr/policies/[key]/page.tsx`, policy download routes,
  `components/hr/policies/*`, and `lib/hr/policies/{employee-entity,policy-entity}.ts`.
- CTC and onboarding approvals: `app/(admin)/admin/approvals/{page,actions}.tsx`,
  `components/admin/approvals/{approval-workbench,ctc-breakup-tab,onboarding-approvals-tab,sortable-table-header}.tsx`,
  `lib/hr/{ctc,onboarding}/approval-list.ts`,
  `lib/hr/onboarding/approval-summary.ts`,
  `lib/compensation/{approval-kinds,workflow}.ts`, and the Accounts approval
  payment boundary.
- Attendance: `app/(app)/attendance/*`,
  `app/api/cron/attendance-autoout/route.ts`, `lib/attendance/*`, and
  `lib/queries/attendance*`.
- Schema/migrations: `db/schema.ts`,
  `db/migrations/0269_vendor_registration_forms.sql`,
  `db/migrations/0270_attendance_three_daily_sessions.sql`, and
  `db/migrations/0271_ctc_approval_workflow.sql`, and
  `db/migrations/0272_onboarding_approval_workflow.sql`.

Migration 0269 is additive to `hr_contacts` and creates
`vendor_registration_links` with hashed tokens. Migration 0270 removes the
former unique attendance event-per-kind index and adds an employee timeline
index, enabling the application-enforced three-session limit. Migration 0271
additively permits `ctc` as a source kind in the existing
`compensation_approvals` audit table. Migration 0272 additively creates
`onboarding_approvals`, with one audited decision per submitted form. Apply all
migrations only through the approved development/release migration process;
they were not applied to a shared or production database during this work.

## Security and access

- Directory mutations and link issuance keep the existing `requireHrStaff`
  authorization and rate limiting.
- Public registration has no dashboard login requirement, but requires a
  256-bit random, hashed, unexpired token scoped to one vendor record.
- CTC decisions retain the existing Super Admin approval authorization. The
  server action validates the source CTC version before writing the audited
  decision, and Accounts rejects any attempt to turn a CTC decision into a
  payment.
- Onboarding decisions use the same Super Admin approval boundary. The action
  validates that the submitted source form belongs to the named employee before
  creating or updating an audited decision; it does not alter onboarding data
  or trigger employee provisioning.
- Accounts workspace pages retain `requireAccountsAccess` outside dummy mode;
  the local dummy-only access relaxation cannot activate in production.
- Policy entity selection is server-derived from the current employee record;
  the client no longer supplies the company identity for sign-off or PDF
  rendering.
- No credentials, production identifiers, or non-synthetic personal data were
  added.

## Validation

- `corepack pnpm test` passed: 407 files, 5,356 tests; 5 files and 34 tests
  skipped.
- `corepack pnpm test:integration` passed after rebuilding its disposable
  `.pglite-test` fixture: 3 files and 27 tests passed; 2 files and 6 tests
  skipped. The fixture had been schema-less before setup, which caused the
  first run to fail with missing-table errors.
- `corepack pnpm build` passed, including Next.js TypeScript validation.
- `corepack pnpm check:leaks` passed: zero PGlite driver/package traces across
  4,180 built server files.
- Full `corepack pnpm lint` and standalone `corepack pnpm typecheck` produced
  no diagnostics but each exceeded the local command-time window. Focused
  linting and the production-build TypeScript phase passed.
- Focused ESLint of the CTC/onboarding approval, workflow, schema, and test
  files passed.
- Browser smoke tests of `/admin/approvals` passed. The Onboarding tab showed
  submitted forms in one-line rows, sorting by employee descending, and the
  drag handles; the CTC tab showed the same sortable/draggable headers and its
  single workspace entry point. The local dummy database had no CTC source
  rows and does not yet have migration 0272, so no persistent approval was
  submitted during visual verification.
- A separate throwaway dummy database was built from all migrations and used
  for an end-to-end onboarding approval: open the tab, choose Yes, confirm
  approval, and verify the saved Yes badge after refresh. The temporary data
  and build output were removed after the check.
- `corepack pnpm test:visual` is currently not green: 19 existing dashboard,
  task, and navigation expectations failed while 13 were skipped. The suite is
  still asserting the pre-Hub root route and old navigation text; no failures
  named the Accounts, approvals, directory, policy, or onboarding paths added
  in this work. Update those visual contracts in a dedicated follow-up before
  treating the visual suite as a merge gate.
- Before push, the branch merged the current remote feature head without
  conflicts (merge commit `84874459`), bringing in the reviewed billing,
  incentive-upload, and security-role work already present on that branch.
  The first post-merge parallel unit run had two activity tests time out and
  one incentive performance assertion exceed its budget under local worker
  contention. Both affected files pass when run serially in isolation. A full
  serial re-run produced no diagnostics but exceeded the local ten-minute
  command window, so rely on the required clean-worker GitHub `test` check for
  the authoritative merged-head result.

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

- Migrations 0271 and 0272 must be applied before persistent CTC and
  onboarding decisions are available outside local test data. The earlier
  migrations remain required for their respective vendor-registration and
  attendance capabilities.
- Production deployment and migration application require release-owner
  approval. No production changes have been made.
- Roll back application behavior by reverting this task commit. The migrations
  are forward-only and additive except for the replaced attendance index; do
  not drop new data columns or tables without a data-aware rollback plan.

## Commit handoff

Feature implementation commit for development review: `23eaffaa`
(`feat(hr): extend accounts and approval workflows`), followed by
`24ef6e81` (handoff update) and merge commit `84874459`. Local build
directories, dummy storage, test artifacts, and the screenshot are
intentionally excluded.
