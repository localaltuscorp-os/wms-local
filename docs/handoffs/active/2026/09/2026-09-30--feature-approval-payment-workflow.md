# Compensation approval and payment workflow

- Date: 2026-09-30
- Work item: `feature/approval-payment-workflow`
- Base commit: `71d75215`
- Status: Implemented locally; migration is not applied and no changes were pushed.

## Objective

Introduce a super-admin approval queue for per-employee attendance, incentives, reimbursements, and salaries. Approval must happen before an Accounts-department user can record a payment. A recorded payment sends the employee a PDF receipt.

## Implementation

- Added `compensation_approvals`, an additive approval/control record keyed by source item. Attendance sheets, incentive requests, reimbursement claims, and salary breakup rows remain their authoritative source data.
- Added People → Approvals with Attendance, Incentive, Reimbursement, and Salary tabs, status filtering, and expandable daily attendance marks.
- An incentive approval requires the super-admin to enter the approved payable amount. Other items begin with their source amount.
- Added Accounts → Approved payments. Only the Accounts department can record these payments. The action rechecks the approved state server-side, updates the relevant salary/reimbursement display record, marks the approval paid, and queues a PDF receipt email.
- Incentive and reimbursement submissions, plus generated salary rows, create a super-admin approval notification through the existing notification dispatcher.
- Reimbursement payment dates can no longer be edited through the generic admin-fields action, which prevents bypassing the approval-to-Accounts path.
- My Salary is now self-only for everyone except super-admins; managers no longer receive downline salary access. Reimbursement list reads now include a manager's transitive reports.

## Files

- `db/schema.ts`
- `db/migrations/0256_compensation_approval_workflow.sql`
- `lib/compensation/workflow.ts`
- `app/(admin)/admin/approvals/*`
- `components/admin/approvals/approval-workbench.tsx`
- `app/(app)/accounts/approvals/*`
- `components/accounts/compensation-payments.tsx`
- `app/(app)/salary/actions.ts`, `lib/salary/salary-people.ts`
- `app/(app)/forms/actions.ts`, `app/(app)/incentive/actions.ts`
- `app/(app)/reimbursements/page.tsx`, `lib/queries/modules.ts`
- `components/admin/admin-nav-config.ts`, `app/(app)/accounts/page.tsx`

## Database and deployment

Apply `db/migrations/0256_compensation_approval_workflow.sql` through the approved development migration process before deploying the routes. It is forward-only and additive. Rollback is removal of the new routes/actions after ensuring no pending production records rely on the table; do not drop the table while audit records are needed.

## Validation

- `git diff --check` passed.
- `corepack pnpm exec vitest run tests/unit/holiday-leave-remote-salary-chain.test.ts` passed (1 file, 52 tests).
- A clean full TypeScript pass completed through the production build's TypeScript stage.
- `corepack pnpm build` compiled successfully, completed TypeScript, and generated the route manifest. It emitted existing dynamic-cookie warnings while attempting static generation for unrelated HR/UI-preview routes; these routes are correctly listed as dynamic and the build completed.

## Follow-up

- Run complete `pnpm typecheck`, focused lint, and the relevant payment/approval integration tests in a normal development shell before review.
- Review the existing salary and legacy incentive-payout pages during QA: the new Accounts queue is the controlled payment route; any legacy payment UI that remains enabled should be retired or routed through `compensation_approvals` before release.
- Preserve unrelated uncommitted HR and holiday changes present in the worktree.
