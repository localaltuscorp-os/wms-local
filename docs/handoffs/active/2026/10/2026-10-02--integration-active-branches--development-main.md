# Active branch integration

## Date and work item

- Date: 2026-10-02
- Branch: `integration/active-branches-2026-10-02`
- Base: `origin/main` at `74ec5fa2`

## Objective

Integrate the currently unmerged application branches into a clean development
worktree, resolve conflicts deliberately, validate the combined result, and
prepare it for review before any change to `origin/main`.

## Planned scope

- `origin/Om`
- `origin/Vinal`
- `origin/mobile-web-login-devices`

The documentation-policy branch is deliberately excluded pending a separate
scope decision. The original local `main` worktree is dirty and is not used or
modified by this work.

## Database and security review

- Vinal includes migration `db/migrations/0263_mcc_multi_date_schedules.sql`.
- Vinal and mobile-login both affect session, permissions, or device handling.
- No migration will be executed and no production deployment will occur during
  this integration.

## Status

## Om integration

- Merged `origin/Om` into this isolated worktree; no change has been made to
  `origin/main`.
- Resolved seven conflicts deliberately.
- The Calendar uses Om's selected-month, collapsible-week design by explicit
  product choice.
- Replaced unused legacy hierarchy and Operations panels with Om's surviving
  components after confirming no current consumers.
- Kept the current Client Engagement table-pane/search architecture, added Om's
  compatible product-dialog support, and retained the newer dialog layering
  while adopting Om's accessible portal behavior.

Focused validation and the remaining branch integrations are still pending.

### Validation

- `pnpm.cmd exec vitest run tests/unit/ce-v2.test.ts tests/unit/exec-calendar-grid.test.ts tests/unit/exec-calendar-markers.test.ts tests/unit/exec-calendar-period.test.ts tests/unit/manager-hierarchy.test.ts`
  - PASS: 5 files, 107 tests.
