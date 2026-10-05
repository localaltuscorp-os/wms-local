# Compensation approver access

- Date: 2026-10-02
- Work item: `compensation-approvals`
- Status: Implemented in code; database setup is required before decisions or payments can be made.

## Objective

Make the compensation approval workflow safe and testable: only audited
database-backed Super Admins may inspect or decide the queue.

## Changes

- The Approvals page and its decision action require an audited database-backed Super Admin grant. No email allow-list, generic admin flag, or incentive-review identity grants compensation approval authority.
- The approval queue has separate Attendance, Incentive, Reimbursement, and Salary tabs, a status filter, decision notes, and a read-only banner when applicable.
- Incentive decisions made in the queue also use the established incentive workflow and audit trail, avoiding a second conflicting source of truth.
- Pending notifications target decision-capable reviewers, not every admin.
- Payment recording remains restricted to Accounts users. It now creates a payment audit record for legacy approved incentive requests that lack a handoff row.
- Payment dispatch sends the existing PDF email receipt and, when the employee has opted in and `META_WHATSAPP_PAYMENT_RECEIPT_TEMPLATE` is configured as an approved Meta document template, sends the same PDF on WhatsApp.
- The connected database does not contain `compensation_approvals`, which is required by this workflow. Approvals now shows source records in read-only setup mode instead of crashing, and Accounts blocks payment recording until the table exists.
- The required canonical migration already exists at `db/migrations/0259_compensation_approval_workflow.sql`. It is additive and idempotent, but has not been executed because the configured database is a remote real-data environment and needs release-owner approval.
- Local dummy mode now seeds a complete approval fixture: pending, approved, rejected, and paid examples across Attendance, Incentive, Reimbursement, and Salary, including daily attendance details.
- Attendance approvals use a table-only layout. The page keeps the "Approvals" heading but removes its description and summary cards. An attendance row expands to a weekly table, and each week independently expands to its daily rows, matching the requested salary-style collapsible pattern.
- The weekly summary now uses the same seven-column grid as the expanded day rows. Its Details control is in the far-right column with no empty trailing cells, and every week starts collapsed when an attendance month is opened.
- The attendance view deliberately does not fabricate balance, adjustment, or earnings figures: those values are not present in the attendance source records. It displays only source-backed attendance and punch information.
- The local fixture includes a full 30-day attendance month per employee and 160 paired attendance punch records, so multiple weekly rows and their check-in, check-out, and work-hour details can be tested immediately.
- The synthetic dummy administrator is granted Super Admin status in the local-only seed so it can exercise the same approval path. Edit changes an unpaid approved/rejected decision's amount or note; it is deliberately unavailable outside the disposable local environment.

## Validation

- `git diff --check` passed.
- Focused ESLint passed for the compensation workflow, approval workbench, incentive permissions, and affected approval/payment routes.
- `corepack.cmd pnpm exec vitest run tests/unit/incentive-approval-workflow.test.ts` passed (37 tests).
- `corepack.cmd pnpm typecheck` was started but did not finish within the 60-second execution limit.
- `0264_super_admin_grants.sql` must be applied alongside the existing `0259_compensation_approval_workflow.sql` before Super Admin compensation access is available outside dummy mode; remote execution still requires release-owner approval.
- Live migration execution and page verification remain pending explicit release-owner approval for the remote database.
- Focused ESLint was re-run after the setup-mode change and passed. The existing incentive approval workflow test suite also passed: 37 tests.
- `pnpm dummy:reset` rebuilt the disposable PGlite database successfully. Verified fixture counts: 4 attendance summaries, 120 attendance days, 160 attendance logs, 4 incentive requests, 4 reimbursements, 4 salary rows, and 12 approval records.
- The dummy server's `/admin/approvals` route returned HTTP 200 on port 3002 after the table UI was compiled.
- Focused ESLint passed for the workflow, workbench, page, and dummy compensation fixture; `git diff --check` passed.
- An isolated production build (`NEXT_DIST_DIR=.next-build-test pnpm build`) passed after correcting strict TypeScript narrowing in the approval workbench and workflow. The normal `.next` output was left untouched because the local development server owns it; the build tool's temporary `tsconfig.json` generated-path additions were reverted.

## Rollback

Remove the read-only admin page access, the optional WhatsApp dispatch call, and
the approval-workbench changes. No migration rollback is required.
