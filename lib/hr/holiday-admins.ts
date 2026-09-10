/**
 * WHO MAY CHANGE THE HOLIDAY CALENDAR — Ruchita and Rutvisha, and nobody else.
 *
 * This list is NARROWER than admin, deliberately. A holiday row is not a
 * cosmetic record: `lib/queries/attendance-status.ts` reads the same table and
 * marks that date a holiday on every employee's attendance for the month, which
 * moves working-day counts, hour targets and ultimately pay. Anyone who can add
 * a date can give the whole company a paid day off, so the capability is held by
 * two named people rather than by whoever happens to hold `isAdmin`.
 *
 * ⚠ THIS REMOVED ACCESS THAT ADMINS USED TO HAVE. The /admin/holidays actions
 * were gated on requireAdmin(); they now gate on this list. Super-admins are NOT
 * included either - "nobody else" was the instruction, and a silent super-admin
 * carve-out would make the rule untrue. If a break-glass path is wanted later,
 * add it here where it can be seen, never at a call site.
 *
 * ── PURE + CLIENT-SAFE ─────────────────────────────────────────────────────
 * No `server-only`, no DB - same shape as lib/auth/super-admin.ts, so a client
 * component can hide a control the server would refuse anyway. The server
 * guards that USE this live in lib/hr/holiday-access.ts.
 *
 * Keyed by email, matching lib/teams/roster.ts: `employees.email` is unique and
 * survives a rename, while the uuid differs per environment.
 */
export const HOLIDAY_ADMIN_EMAILS = [
  "ruchitaambre.altuscorp@gmail.com", // Ruchita Ambre
  "rutvishamehta.altuscorp@gmail.com", // Rutvisha Mehta
] as const;

/** True for the two people allowed to change the holiday calendar. */
export function canManageHolidays(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return HOLIDAY_ADMIN_EMAILS.includes(e as (typeof HOLIDAY_ADMIN_EMAILS)[number]);
}
