# Task timer column position

Date: 2026-10-05
Branch: `bugfix/task-timer-column-position`

## Outcome

- The Start/Stop timer button is directly beside the row-selection checkbox.
- Existing per-user saved column layouts are migrated once, so the live UI does not leave the timer at the far right.
- The timer control is not draggable; task data columns remain reorderable.

## Validation

- Changed-file ESLint passed.
- `pnpm typecheck` passed.

## Rollback

Revert the application commit. No database change is involved.
