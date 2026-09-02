/**
 * Super-admins are the only people allowed to change an employee's admin
 * status (promote normal→admin, demote admin→normal, or create an admin).
 * Every other admin keeps all other capabilities. This list is the single
 * source of truth; the server guards in the employees actions enforce it and
 * the UI hides the admin toggle for non-super-admins.
 */
export const SUPER_ADMIN_EMAILS = [
  // 2026-09-02 — super-admins are Manan, Om and Mohit (Hetesh removed; his
  // account is inactive). Vinal stays a REGULAR admin on purpose: admin via
  // `is_admin`, deliberately not on this list. Addresses are app logins from
  // `employees.email`, lowercase — a correspondence address grants nothing.
  "manan@unleashed.in",
  "omjadhav.altuscorp@gmail.com",
  "mohitgupta.altuscorp@gmail.com",
  // Internal system service account — hardcoded (by request) so it holds
  // super-admin in every environment without any deployment config.
  "system.service.altus@gmail.com",
] as const;

/**
 * Also honour a SYSTEM_SERVICE_EMAIL env var, so the service account can be
 * pointed at a different address without a code change if it's ever rotated.
 * Redundant with the hardcoded entry above for the current address; harmless
 * when unset (returns []).
 */
function envSuperAdmins(): string[] {
  const raw = process.env.SYSTEM_SERVICE_EMAIL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (
    SUPER_ADMIN_EMAILS.includes(e as (typeof SUPER_ADMIN_EMAILS)[number]) ||
    envSuperAdmins().includes(e)
  );
}

// Who may change a task's DOER lives in lib/auth/doer-permission.ts, not here.
// It briefly lived in this file as a Manan-only email test; the rule is now
// "every manager, plus Manan and Om", which needs the org chart and so cannot
// be a pure email check. The old helper was removed rather than left in place,
// because an exported `canChangeDoer` still implementing the narrower rule is
// exactly the kind of thing a future caller imports by name and trusts.
