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

## Vinal integration

- Merged `origin/Vinal` into this isolated worktree; no change has been made to
  `origin/main`.
- Preserved Om's already-integrated navigation and module-footer implementations
  where Vinal conflicted.
- Preserved the existing Billing document `gst_certificate` slot in
  `db/schema.ts` while retaining Vinal's formatting.
- Vinal's Employees Compliance Check (CC) migration
  `db/migrations/0263_mcc_multi_date_schedules.sql` is included but has not
  been executed.
## Mobile web login and device integration

- Integrated `origin/mobile-web-login-devices` into this isolated worktree.
- Retained the current shared `mintSessionForIdToken` and
  `lib/security/device-access` path instead of reintroducing the branch's
  retired `lib/attendance/web-device` implementation. The current path already
  adopts a web browser at sign-in and enforces device access across the WMS,
  including two-step checks; this avoids duplicating and weakening the newer
  security boundary.
- Added `/get-app` to the public path allowlist so the branch's Get App page is
  reachable before sign-in.
- No production branch, deployment, migration execution, or direct change to
  `origin/main` has occurred.

The integration branch has not been pushed or promoted. Full-suite validation
passed after all approved active branches were integrated. The branch has not
yet been pushed or promoted.

## Post-integration build repair

- Vercel's production build at `f2baa3de` failed because the retained
  navigation still imported the retired `lib/dcc/nav` file after the Employees
  Compliance Checklist migration removed it.
- Restored Vinal's complete navigation file by explicit product direction. It
  removes the retired DCC import, uses the live Employees Dashboard and
  Compliance Checklist routes, and restores Vinal's detailed Billing labels.
- Verified that the requested Billing, Archive, and Task Detail refinements are
  already present in the current codebase; no historical Billing/schema code
  was blindly reapplied.
- A local production build and typecheck both exceeded the interactive time cap
  before returning a result. The exact Vercel missing-module error has been
  removed from the source and focused validation passed.

### Validation

- `pnpm.cmd exec vitest run tests/unit/ce-v2.test.ts tests/unit/exec-calendar-grid.test.ts tests/unit/exec-calendar-markers.test.ts tests/unit/exec-calendar-period.test.ts tests/unit/manager-hierarchy.test.ts`
  - PASS: 5 files, 107 tests.
- `pnpm.cmd exec vitest run tests/unit/cc-timeframes.test.ts tests/unit/compliance-columns.test.ts tests/unit/compliance-bulk-actions.test.ts tests/unit/compliance-quantity-actions.test.ts tests/unit/api-guard.test.ts tests/unit/permission-catalog.test.ts tests/unit/master-admin-authorization.test.ts tests/unit/incentive-master-authorization.test.ts tests/unit/module-backup.test.ts tests/unit/my-salary.test.ts tests/unit/reimbursement-attachments.test.ts tests/unit/wms-legacy-entry.test.ts`
  - PASS: 12 files, 240 tests.
- `pnpm.cmd exec vitest run tests/unit/device-access.test.ts tests/unit/device-exemption-login.test.ts tests/unit/device-registration-flow.test.ts tests/unit/device-self-registration.test.ts tests/unit/attendance-authorization.test.ts tests/unit/punch-no-task-prerequisite.test.ts`
  - PASS: 6 files, 121 tests.
- `pnpm.cmd test`
  - PASS: 393 test files, 5 skipped; 5,292 tests passed, 34 skipped.
- `pnpm.cmd exec vitest run tests/unit/wms-legacy-entry.test.ts tests/unit/permission-catalog.test.ts tests/unit/cc-timeframes.test.ts`
  - PASS: 3 files, 26 tests.
