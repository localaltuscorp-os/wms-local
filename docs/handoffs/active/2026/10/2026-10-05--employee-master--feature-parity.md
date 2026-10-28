# Employee Master feature parity

- Date: 2026-10-05
- Work item: Employee Master parity
- Status: Implemented; validation complete; not committed or pushed.
- Objective: Expose existing employee configuration and lifecycle actions in Employee Master without new data models.

## Changes

- Master query now includes staff-account inactive/offboarded rows, department memberships, role, admin/grant state, and WhatsApp consent.
- Employee Master workspace edits Task Role, multiple Functions/Primary Function, Admin/Master Admin/Issue Letters/DCC grants, WhatsApp/consent, quota, weekly off, late/early thresholds, worker-type thresholds, and attendance weekly target.
- Existing `editEmployee`, `updateEmployeeAttendanceSchedule`, invitation, resend-invite, and permission actions remain write paths.
- Employee Master page now exposes Invite Employee; row actions expose Resend Invite.
- Existing Past/offboarded status filtering now has rows to filter.
- Updated stale Employee Master unit expectations for merged Documents and editable Functions.
- Follow-up UI/calculation polish: removed the duplicate Identity Employee Code,
  expanded Functions to a readable full-width list, added calendar tenure days,
  switched threshold/attendance-target inputs to hours (persisted as minutes),
  and derived half-day thresholds from official timing spans.
- Fixed schedule saves so edited official start/end times are not overwritten when
  threshold values are saved in the same draft.
- Normalized stored late/early time values back to `HH:mm` before schedule-action
  validation, matching the native time controls.

## Database and migration

- No schema or migration changes.
- No database writes performed during implementation.

## Verification

- Targeted Vitest: `tests/unit/employee-master-fields.test.ts` (51 tests passed).
- Targeted ESLint: `workspace.tsx` and `department-multi-select.tsx` passed.
- Local `/admin/employee-master` request returned HTTP 200 after the patch.
- Full typecheck was attempted but did not produce output in the repository's
  generated-route state; it was stopped. No source error was reported by the
  dev compiler while loading the affected route.
- Production build compiled successfully, then failed existing generated `.next-build`/`.next` route-validator errors (`/dcc` and missing generated route modules). No source type error from this change remained.
- Full typecheck reports same generated route-validator errors; source files compile under build compilation.

## Known issues / next steps

- Generated `.next*` folders and prior uncommitted UI changes remain in worktree; preserve and review before commit.
- Run a clean build after resolving stale generated Next route types.
- Review capability grant behavior in a role matrix before release.

## Rollback

- Revert implementation files only; no migration rollback required.
