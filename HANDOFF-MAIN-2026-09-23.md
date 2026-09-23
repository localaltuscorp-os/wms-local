# Main Handoff - 23 September 2026

## Delivery state

- Target branch: `main`
- Remote: `origin` (`localaltuscorp-os/wms-local`)
- This delivery combines the previously integrated Shreya goals work with the
  latest Vinal and Om branches.
- Shreya source tip: `ea099f3e`; integrated implementation on main:
  `cbef90b6`.
- Vinal source tip: `1458c809`; merged into main with merge commit
  `64b01acf`.
- Om source tip: `55c95553`; merged into main with merge commit `9e02190d`.

## Shreya - Goals review and approval

- Redesigned Goals Review with level tabs, status cards, fiscal-year and
  reviewer controls, compact search, sorting, pagination, and full-screen mode.
- Redesigned Goals Approve with week tabs, team-status cards, search, sorting,
  pagination, and inline expansion of the selected employee's goals.
- Preserved the existing approval actions and business rules.
- Added a development-only preview board for environments without reporting
  relationships. It is gated by `DISABLE_AUTH=true` and must not be treated as
  production data.
- Main files:
  - `app/(app)/goals/review/page.tsx`
  - `app/(app)/goals/approve/page.tsx`
  - `components/goals/review/*`
  - `components/goals/approve/*`

## Vinal - Employee dashboards and navigation

- Refreshed attendance, leave, reimbursement, goals, queries, compliance, and
  operations dashboard experiences.
- Added the Operations dashboard route.
- Added the HR query notification inbox control and expanded ticket composer
  behavior.
- Updated the main navigation, sidebar rail/branding, workspace registrations,
  DCC quick navigation, and operations/HR navigation definitions.
- Main files:
  - `app/(app)/attendance/**`
  - `app/(app)/operations/**`
  - `app/(app)/queries/page.tsx`
  - `app/(app)/reimbursements/**`
  - `components/goals/dashboard/goals-overview-dashboard.tsx`
  - `components/hr/queries/notification-inbox-button.tsx`
  - `components/layout/{main-nav,sidebar-brand,sidebar-rail}.tsx`

## Om - Incentives, salary, logs, templates, and control panel

- Completed the incentive workflow: product master, applicability, request and
  approval flows, reversals, manual payments, analytics, notifications, and My
  Incentives.
- Reworked salary output with the three-page salary slip, salary statement,
  PDF generation, reimbursement earnings, and incentive payout integration.
- Added global activity logging: ingestion, sessions, sanitization, module
  mapping, filters, admin UI, detail views, and export.
- Added the access-control/control-panel workspaces for roles, permissions,
  effective access, users, visibility grants, and temporary access.
- Standardized downloadable templates and access checks for task, goals,
  project-plan, weekly-goal, and other bulk imports.
- Expanded employee administration for employee types, interns, probation,
  invitations, and related validation.
- The final Om fix covers employee-delete log references, logs export,
  incentive-year salary slips, and incentive applicability.

## Database work required before production verification

Review and apply these migrations in numeric order using the established
production migration process:

1. `db/migrations/0242_visibility_grants.sql`
2. `db/migrations/0243_incentive_product_master_rows.sql`
3. `db/migrations/0244_incentive_applicability_and_intern_type.sql`
4. `db/migrations/0245_global_logs.sql`
5. `db/migrations/0246_control_panel.sql`
6. `db/migrations/0247_activity_logs_allow_fk_null.sql`

Supporting apply/verify scripts are under `Change-made/SQL/`. Confirm the
database project/reference before running any SQL; do not infer migration state
from filenames alone.

## Merge decisions

The Om merge produced two textual conflicts:

- `components/hr/candidate/management-assessment-screen.tsx`: retained main's
  registered hyphenated letter keys (`free-training` and
  `assignment-needed`) and its explicit recruiter-email outcome guard.
- `db/schema.ts`: retained main's TypeScript-safe `candidateIntake`
  self-reference representation. The foreign key remains enforced by the
  migration. Duplicate `paAmbassadors.ownerPersonId` and `status` fields
  created by automatic merge composition were removed.

Vinal merged after Om without textual conflicts. `components/layout/main-nav.tsx`
was combined automatically by Git and should receive a navigation smoke test.

## Validation status

- No unresolved merge entries remain.
- Conflict-marker scan passed (the underline in
  `public/signatures/README.txt` is ordinary text).
- `git diff --check` passed before the merge commits.
- Targeted ESLint completed with zero errors and 21 existing React/Next
  warnings in the management-assessment screen.
- Eight targeted unit-test files passed: 131 tests covering employee types,
  incentive applicability/manual payments, logs, salary-slip PDFs, task
  visibility, templates, and reimbursement earnings.
- The full TypeScript check did not complete locally: the first run exceeded
  Node's default heap, and a 4 GB retry exceeded the two-minute command limit.
  This is an incomplete check, not a reported TypeScript failure.

## Release checklist

1. Run the full TypeScript and lint checks in CI or with sufficient local
   memory/time.
2. Run unit tests, with special attention to incentives, salary slips,
   permissions, logs, templates, tasks, and reimbursements.
3. Apply and verify migrations `0242`-`0247` against the correct environment.
4. Smoke-test Goals Review/Approve, Attendance/Leave, Reimbursements,
   Operations, HR Queries, Incentives, My Salary, Admin Logs, and Control Panel.
5. Verify desktop and small-screen navigation, especially the automatically
   combined main navigation.
6. Confirm scheduled routes and environment configuration for monthly salary
   slips and log finalization before enabling production schedules.

## Known follow-ups

- Shreya's requested drag-and-drop column reordering is not implemented;
  column sorting is implemented.
- Remove the development-only Goals Approve preview fallback when real
  reporting relationships are available for all test users.
- Do not deploy the new database-dependent screens until the migrations above
  have been verified in the target environment.
