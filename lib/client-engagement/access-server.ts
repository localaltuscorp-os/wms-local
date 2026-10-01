import "server-only";
import type { Employee } from "@/db/schema";
import { isHrStaff } from "@/lib/hr/access";

/**
 * Client Engagement access rules.
 *
 * Management is role based: HR staff may assign, transfer, manage the roster,
 * and edit schedules. Any administrator or super-admin may view calendars.
 * An assigned team member may edit that account. Server actions enforce these
 * rules; UI visibility is only a convenience.
 */

/** May this person assign, transfer, manage the roster and edit any schedule? */
export async function canManageCe(actor: Employee, dummyMode = false): Promise<boolean> {
  // Dummy mode is development-only. Its seeded administrator keeps the module
  // usable locally without introducing a person-specific production rule.
  if (dummyMode && actor.isAdmin) return true;
  return isHrStaff(actor);
}

/** May this person pick any employee's calendar, not just their own? */
export async function canViewAnyCalendar(actor: Employee, isSuperAdmin: boolean, dummyMode = false): Promise<boolean> {
  if (actor.isAdmin || isSuperAdmin) return true;
  return canManageCe(actor, dummyMode);
}

/**
 * May this person edit an account (details, status, its calls)? A manager may
 * edit any; a team member may edit the ones assigned to them.
 *
 * `assigneeEmployeeId` is the login behind the account's assignee, or null when
 * it is unassigned or the assignee has no login.
 */
export async function canEditAccount(
  actor: Employee,
  assigneeEmployeeId: string | null,
  dummyMode = false,
): Promise<boolean> {
  if (await canManageCe(actor, dummyMode)) return true;
  return Boolean(actor.id && assigneeEmployeeId && actor.id === assigneeEmployeeId);
}
