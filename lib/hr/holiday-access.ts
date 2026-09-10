import "server-only";
import type { Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canManageHolidays } from "@/lib/hr/holiday-admins";

/**
 * Server guard for every write to the holiday calendar. The allow-list itself,
 * and why it is narrower than admin, live in ./holiday-admins.ts.
 */
export { HOLIDAY_ADMIN_EMAILS, canManageHolidays } from "@/lib/hr/holiday-admins";

/** Thrown-by-redirect equivalent for actions: returns the employee or refuses. */
export async function requireHolidayAdmin(): Promise<Employee> {
  const me = await requireUser();
  if (!canManageHolidays(me.email)) {
    // Actions return a typed refusal rather than redirecting - the caller is a
    // form, not a navigation.
    throw new Error("Only Ruchita and Rutvisha can change the holiday calendar.");
  }
  return me;
}
