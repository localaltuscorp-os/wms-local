# Operations dashboard invalid-date guard

Date: 2026-10-05
Branch: `bugfix/operations-invalid-date`

## Outcome

- The Operations dashboard no longer crashes when a legacy Hand-holding call contains a malformed day value.
- Upcoming calls accept only ISO calendar days before reaching the client.
- Operations date and time formatters now return safe labels for invalid values instead of throwing `RangeError: Invalid time value`.

## Validation

- Changed-file ESLint passed.
- `pnpm typecheck` passed.

## Rollback

Revert the application commit. There is no schema or data change for this fix.
