# Training WMS UI cleanup

- Date: 2026-09-29
- Work item: Training WMS UI cleanup
- Status: Complete locally; not committed or pushed

## Objective

Make the primary Training surfaces compact and consistent with WMS tables,
filters, command bars, and modal dialogs without changing Training rules.

## Changes

- Learning Library now uses the shared command bar. The existing tabs remain.
  Materials has local Any Date and Created By filters. Self Learning and Learning
  Shares have equivalent date and creator filters using their existing rows.
- Self-Learning keeps the monthly progress summary. Its entry form is now a
  scrollable modal with the existing form, validation, server action, and fields.
- Training Calendar now has Any Date and Created By filters. Its create session
  form is a scrollable modal. Existing `SessionForm` and scheduling action remain
  the only write path.
- Obligations now renders as a compact table using existing employee, function,
  give, attend, self-learning, share, and computed status values. No new
  obligation fields or actions were invented.
- The personal Self-Learning page shows only the current employee in Created By.
  Showing other employees would change existing scope and permissions.

## Files

- `app/(app)/training/page.tsx`
- `app/(app)/training/self-learning/page.tsx`
- `app/(app)/training/calendar/page.tsx`
- `app/(app)/training/obligations/page.tsx`
- `components/training/materials-table.tsx`
- `components/training/learning/self-learning-form.tsx`
- `components/training/learning/self-learning-log-dialog.tsx`
- `components/training/calendar/calendar-board.tsx`
- `components/training/calendar/session-form.tsx`
- `lib/queries/learning-library.ts`
- `lib/queries/training-calendar.ts`
- `tests/unit/training-ui-cleanup.test.ts`

## Database and access impact

No schema or data changes. Library and calendar read models now expose existing
employee ids for local filtering. Existing workspace scope, per-page guards,
server action validation, attendance, and scheduling checks remain authoritative.

## Verification

- `node node_modules/vitest/vitest.mjs run tests/unit/training-ui-cleanup.test.ts` — 5 passed
- Focused ESLint command for changed Training files — passed
- `node node_modules/typescript/bin/tsc --noEmit` — blocked by stale `.next`
  validator reference to unrelated missing `app/(app)/control-panel/effective-access/page.js`

## Known state

No browser visual run was performed. Responsive behavior uses existing
`max-md` controls, table overflow, and dialog viewport constraints; review the
four primary Training pages in a browser before release.

The worktree also contains unrelated Dropdown, Temporary Access, and Employee
Master work. Preserve it when staging or committing.

## Rollback

Restore the listed Training files from the prior revision. No migration or data
rollback is required.
