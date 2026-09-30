# Incentive Status removal and request guards

- Date: 2026-09-29
- Work item: Incentive Status removal and request mutation rules
- Status: Complete locally; not committed or pushed

## Objective

Remove the obsolete Incentive Status tab, retain its reachable permanent-entry
payment and team-split controls in Entries, remove Dashboard Target vs Actual,
and allow safe pending-request edit/delete only.

## Changes

- Removed Target vs Actual from the Incentive Dashboard. Shared target and
  earned model values remain because other dashboard summaries use them.
- Removed the `status` tab, sidebar entry, status-only loader/query/action flag,
  report, editor, and components. There was no standalone Status route: it was
  the `/incentive?tab=status` client tab.
- Moved reachable permanent-entry Booked/Accrued/Paid editing into the existing
  admin Entries form and moved team-split management into Entries. Existing
  manual payment ledger writes and paid-increase notifications remain.
- Audited the project-leg status action before deletion: it had no caller, so
  removing the Status surface did not remove a reachable project workflow.
- Added pending request Edit and Delete row actions without changing request
  columns, filters, or table layout. The detail view is now a compact two-column
  facts grid with the existing history and decision controls retained.
- Normal request edits append a submission snapshot using `Updated before
  review.`; they never overwrite previous submissions. Resubmit remains the
  only edit path for rejected or revision-requested records.

## Security and data

- No database/schema/migration change.
- Server actions require owner or admin, require `pending`, and re-check that
  no decision exists under transaction row lock before amend/delete.
- A delete is additionally guarded by `status = pending`; a decided request is
  refused before its cascade could remove decision/history records.
- Existing reviewer decision and resubmission authorization remains unchanged.

## Files

- `app/(app)/incentive/actions.ts`
- `app/(app)/incentive/admin-actions.ts`
- `app/(app)/incentive/page.tsx`
- `components/incentive/incentive-list.tsx`
- `components/incentive/incentive-form-dialog.tsx`
- `components/incentive/incentive-history.tsx`
- `components/incentive/incentive-entries.tsx`
- `components/incentive/incentive-entry-split-dialog.tsx`
- `components/incentive/incentive-tabs.tsx`
- `components/layout/main-nav.tsx`
- `lib/incentive/workflow-server.ts`
- `lib/incentive/workflow.ts`
- `lib/queries/incentive.ts`
- `lib/queries/incentives.ts`
- `tests/unit/incentive-request-mutations.test.ts`

Deleted Status-only files include `status-actions.ts`, `incentive-status-tab.tsx`,
`incentive-status-report.tsx`, `incentive-status-editor.tsx`,
`incentive-team-split.tsx`, `status-flag.ts`, and `incentive-status.ts`.

## Verification

- `pnpm vitest run tests/unit/incentive-manual-payment.test.ts --reporter=dot --no-file-parallelism` — 10 passed
- `pnpm vitest run tests/unit/incentive-approval-workflow.test.ts tests/unit/incentive-notifications.test.ts --reporter=dot --no-file-parallelism` — 79 passed
- `pnpm vitest run tests/unit/incentive-request-mutations.test.ts --reporter=dot --no-file-parallelism` — 3 passed
- `pnpm typecheck` was run without reported TypeScript errors.
- No browser visual run performed.

## Rollback

Restore the listed Incentive files from the prior revision. No data rollback is
required because no migration or data write was performed during implementation.

## Worktree note

The worktree contains unrelated Billing, Training, Dropdown, Employee Master,
and Temporary Access changes. Preserve them when staging this work.
