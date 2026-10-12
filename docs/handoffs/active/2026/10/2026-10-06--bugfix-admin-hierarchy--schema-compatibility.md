# Admin hierarchy schema compatibility

- Date: 2026-10-06
- Work item/branch: `bugfix/forgotten-punchout-absent-altus-os`
- Objective: Restore Admin Reporting Hierarchy and Employee Master when the optional temporary-break migration trails the application deploy.
- Status: Implemented and locally validated; preview deployment pending.

## Summary

Both routes call `getHierarchy()`. Its temporary-break lookup referenced the table introduced by migration 0262 without the schema-compatibility handling already used by the adjacent sort-order and manager-flag lookups. A database that has not yet applied 0262 therefore returned PostgreSQL `42P01`/`42703` and the shared Admin error boundary replaced both pages.

The hierarchy query now treats only those two schema-behind codes as an empty temporary-break set. All connection, authorization, timeout, and other database failures are rethrown. Core reporting relationships continue to come from `employees.manager_id`.

## Files changed

- `lib/queries/hierarchy.ts`: added the narrow SQLSTATE guard and isolated active-break loading.
- `tests/unit/hierarchy-query.test.ts`: verifies missing table/column errors degrade safely while operational errors remain visible.

## Database and migrations

- No database writes or schema changes.
- Migration 0262 remains the canonical long-term setup for temporary-break display. This compatibility path does not replace applying it through the approved migration process.

## Security and authorization

- No authentication or authorization change.
- No employee identifiers or personal data added.
- Admin and active-employee route guards are unchanged.

## Testing

- `pnpm.cmd exec eslint lib/queries/hierarchy.ts tests/unit/hierarchy-query.test.ts` — passed.
- `pnpm.cmd exec vitest run tests/unit/hierarchy-query.test.ts` — passed, 6 tests.
- `$env:NODE_OPTIONS='--max-old-space-size=4096'; pnpm.cmd typecheck` — passed.
- `git diff --check` — passed (Git emitted only the existing Windows line-ending notice).

## Known issues and remaining work

- Confirm both routes render on the new authenticated Vercel preview.
- Apply migration 0262 through the approved release process to enable temporary-break restoration data in that environment.

## Deployment and rollback

- Deploy only as a branch preview until reviewed and approved for production promotion.
- Rollback is the revert of the implementation commit; no database rollback is required.
