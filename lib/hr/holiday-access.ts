import "server-only";
import type { Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canManageHolidays } from "@/lib/hr/holiday-admins";

/**
 * Server guard for every write to the holiday calendar. The rule itself
 * (HR staff, and super-admins) lives in ./holiday-admins.ts.
 */
export { canManageHolidays } from "@/lib/hr/holiday-admins";

/** Thrown-by-redirect equivalent for actions: returns the employee or refuses. */
export async function requireHolidayAdmin(dummyMode = false): Promise<Employee> {
  const me = await requireUser();
  if (!(await canManageHolidays(me, dummyMode))) {
    // Actions return a typed refusal rather than redirecting - the caller is a
    // form, not a navigation.
    throw new Error("Only HR staff and super-admins can change the holiday calendar.");
  }
  return me;
}
