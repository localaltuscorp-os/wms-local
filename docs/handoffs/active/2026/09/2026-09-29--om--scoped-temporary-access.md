# Scoped temporary access

Date: 2026-09-29

Objective: Replace account-level Temporary Access UI with a server-enforced restrictive module overlay.

Status: Implemented locally; migration not applied.

Changes:

- Added additive scoped grant, recipient, and scope tables in migration `0258_scoped_temporary_access.sql` (renumbered during integration because `0254` already existed on `origin/main`).
- Preserved legacy `delegated_access_grants` token flow unchanged.
- Added overlay resolver: existing authorization AND temporary scope.
- Rebuilt Temporary Access form for multi-employee module scopes, custom navigation choices, preset/custom dates, and selected-recipient revoke confirmation.

Database:

- Apply `db/migrations/0257_role_assignment_expiration.sql` and then `db/migrations/0258_scoped_temporary_access.sql` before deploying code that writes scoped grants.
- Rollback: stop issuing scoped grants; existing delegated grants are unaffected. Do not drop tables while audit/history may be needed.

Security:

- Temporary scopes never grant roles, capabilities, data access, or domain authority.
- Viewing/custom scopes remove edit access. Unselected catalogue routes are denied server-side.
- Legacy delegation security, token hashing, expiry, and revocation remain unchanged.

Testing:

- `node node_modules/vitest/vitest.mjs run tests/unit/scoped-temporary-access.test.ts` passed: 4 tests.
- Focused ESLint passed.
- Full typecheck blocked by existing stale `.next/types/validator.ts` reference to missing `control-panel/effective-access` page.

Remaining:

- Apply migration in target environment, then manually verify a recipient cannot open an unselected route or submit a scoped write.
