# HR Admin Salary Viewer Access

Date: 2026-10-08
Branch: `bugfix/hr-admin-salary-view`
Status: Ready for review

## Objective

Restore the My Salary person picker for employees who are both HR staff and administrators.

## Change

- `lib/salary/salary-people.ts` now grants organization-wide salary-view scope to super-admins and to employees who have both the existing Admin flag and HR staff membership.
- The same server-side rule protects the picker, direct `?emp=` navigation, salary statement, and ledger actions through the shared salary access helpers.
- `lib/hr/access.ts` now accepts the minimal employee fields it actually reads, allowing the existing HR membership check to be reused without duplicating HR role logic.

## Database and deployment

No schema, migration, role-record, or payroll-data changes. A normal employee remains self-only. This branch requires review and a production release before it changes the live site.

## Validation

- `git diff --check` passed.
- `pnpm.cmd typecheck` could not start in the isolated worktree because it has no local `node_modules` directory.
- A shared-workspace TypeScript check was attempted with a 4 GB heap and exceeded the 60-second command limit before returning a result.

## Rollback

Revert the commit that changes `lib/salary/salary-people.ts` and `lib/hr/access.ts`.
