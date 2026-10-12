# Attendance manager role

- Date: 2026-10-12
- Branch: `feature/attendance-manager-role`
- Objective: Make attendance-log editing for other employees depend on the database-backed `attendance_manage` hidden role.
- Status: Implemented on the feature branch; not merged or deployed.

## Summary

The attendance mutation guard no longer uses the legacy identity capability for privileged edits. It now checks the existing `security_role_grants` table through `hasSecurityRole(..., "attendance_manage")`. The role catalogue marks `attendance_manage` as enforced, so the existing Super Admin hidden-role panel can grant or revoke it without a code change.

Self-correction windows, registered-device rules, month locks, and audit-context recording are unchanged.

## Files changed

- `lib/auth/security-roles-catalog.ts`: mark the existing Attendance Manager role as enforced.
- `lib/auth/security-roles.ts`: expose the database-backed attendance role check.
- `lib/security/attendance-authorization.ts`: use the role check for privileged attendance mutations.
- `app/(app)/attendance/actions.ts`: update the server-action documentation to describe the role-based gate.
- `tests/unit/attendance-authorization.test.ts`: mock role decisions with synthetic employee IDs so the unit test remains isolated from a live database.
- `tests/unit/security-roles.test.ts`: verify the role key and enforced status.

## Database and assignment

No schema or migration change is required; `security_role_grants` already exists. The authorized Super Admin must assign `Attendance Manager` to the two approved employee records from `/admin/security-roles`. No employee identity is hardcoded in this change. Review the holder list after assignment so no unintended active employee retains the role.

## Tests

- Focused Vitest: passed, 2 files / 31 tests.
- Focused ESLint: passed for all changed source and test files.
- TypeScript: reached the existing unrelated `nodemailer` module/type resolution error in `lib/email/transport.ts` after increasing the local Node heap; no changed-file diagnostic was reported.
- `git diff --check`: passed.

## Deployment and rollback

Preview the feature branch before promotion. Rollback is a revert of the feature commit; role grants remain data and can also be revoked in the hidden-role panel.
