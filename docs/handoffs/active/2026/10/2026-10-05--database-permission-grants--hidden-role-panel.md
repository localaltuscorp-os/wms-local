# Hidden role panel

Date: 2026-10-05  
Branch: `feature/database-permission-grants`  
Status: implemented locally; database migration and deployment not yet performed.

## Objective

Give database-backed Super Admins a private panel for granting and revoking the approved hidden operational roles without embedding employee identities in code.

## Implementation

- Extended the existing text-keyed `security_role_grants` catalogue from Account Unlocker to the approved hidden operational roles.
- Added `/admin/security-roles`, visible and writable only to database-backed Super Admins.
- The page provides role selection, plain-language role descriptions, search over active employees, current-holder counts, and Grant/Remove actions.
- Every write re-checks Super Admin status server-side, validates the role key and active employee, rate-limits the actor, blocks self-assignment, and writes through the existing `security_role_grants` plus append-only `security_role_events` tables.
- Added a navigation item under Admin › Access and a repository rule prohibiting runtime identity allow-lists.

## Important scope boundary

The panel persists and audits every listed role now. Only `account_unlock` is currently enforced by a database role in runtime guards. The remaining entries are clearly labelled as stored/audited pending a separate, complete migration of legacy email-based guards. Do not represent a stored role as effective access until its guard migration is complete and tested.

## Database

- No schema migration is required for the panel: `security_role_grants` and `security_role_events` already exist and accept role values as text.
- No database writes were performed in this work session.

## Validation

- `pnpm.cmd exec eslint` on the changed TypeScript/TSX files: passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm.cmd typecheck`: passed.
- `pnpm.cmd test tests/unit/security-roles.test.ts`: passed, 10/10.
- `pnpm.cmd check:leaks`: passed; zero watched-package and PGlite trace leaks.

## Next steps

1. Run focused tests, review diff and security scan.
2. Commit and push the feature branch.
3. Deploy a Vercel preview and test the panel using a database-backed Super Admin.
4. Migrate legacy email/name guards one role at a time, with direct server-side enforcement tests.
5. Do not modify production `fork/main` without separate release approval.
