# Database-backed punch-anywhere permission

- Date: 2026-10-06
- Branch: `bugfix/database-remote-login-exemption`
- Status: Implemented and locally verified; development PR open.

## Objective

Allow a Super Admin to select employees who may punch attendance from any location or network.

## Implementation

- Reused the existing `security_role_grants` and `security_role_events` tables.
- Added the enforced `attendance_punch_anywhere` role to `/admin/security-roles` as **Punch From Anywhere**.
- Web punches for a holder bypass the office geofence and office-IP allowlist.
- Mobile punches for a holder bypass the office geofence.
- Login restrictions, approved-device checks, authentication, mobile biometric/device binding, integrity checks, nonce checks, and the normal punch audit data remain unchanged.
- When location is supplied, distance from the office is still recorded even though it is not used to reject the punch.

## Files

- `lib/auth/security-roles.ts`
- `lib/auth/security-roles-catalog.ts`
- `lib/attendance/record-punch.ts`
- `app/(app)/attendance/actions.ts`
- `app/api/mobile/attendance/punch/route.ts`
- `tests/unit/punch-anywhere.test.ts`

## Database

No schema migration is required. Migration `0238_security_role_grants.sql` already provides the text-keyed grant and audit tables.

## Validation

- `pnpm.cmd exec vitest run tests/unit/punch-anywhere.test.ts tests/unit/security-roles.test.ts tests/unit/geofence.test.ts tests/unit/device-exemption-login.test.ts` — 4 files, 38 tests passed.
- `$env:NODE_OPTIONS='--max-old-space-size=4096'; pnpm.cmd typecheck` — passed.

## Rollback

Revert the task commits. Existing grant rows are inert if no runtime guard reads their role key.
