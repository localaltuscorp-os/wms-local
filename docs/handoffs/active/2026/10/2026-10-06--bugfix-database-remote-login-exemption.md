# Database-backed remote login exemption

- Date: 2026-10-06
- Branch: `bugfix/database-remote-login-exemption`
- Status: Implemented and locally verified; awaiting development PR/deployment.

## Objective

Allow a Super Admin to select employees who may sign in to WMS from any device, location, or network without requiring device approval.

## Implementation

- Reused the existing `security_role_grants` and `security_role_events` tables.
- Activated the existing `device_exempt` role in the Super Admin-only `/admin/security-roles` panel.
- Applied the database role to both login-time device adoption and the device gate used on subsequent requests.
- Retained the legacy code capability as a temporary compatibility fallback so existing exempt accounts are not locked out before their grants are migrated.
- Authentication remains mandatory. Attendance-punch IP/geofence policy is unchanged.

## Files

- `lib/auth/security-roles.ts`
- `lib/auth/security-roles-catalog.ts`
- `lib/security/device-access.ts`
- `lib/security/device-registration.ts`
- `tests/unit/device-exemption-login.test.ts`

## Database

No schema migration is required. Migration `0238_security_role_grants.sql` already provides the grant and audit tables.

## Validation

- `pnpm.cmd exec vitest run tests/unit/device-exemption-login.test.ts tests/unit/device-access.test.ts tests/unit/device-registration-flow.test.ts tests/unit/security-roles.test.ts` — 4 files, 68 tests passed.
- `$env:NODE_OPTIONS='--max-old-space-size=4096'; pnpm.cmd typecheck` — passed.

## Rollback

Revert the task commit. Existing role rows can remain because prior code treats `device_exempt` as stored but unenforced.

## Follow-up

- Migrate legacy hardcoded device-exemption holders into database grants, verify them, and then remove the compatibility fallback from `lib/security/capabilities.ts`.
- Create the development PR and a Vercel preview after push.
