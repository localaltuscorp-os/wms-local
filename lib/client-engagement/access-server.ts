import "server-only";
import type { Employee } from "@/db/schema";
import { isHrStaff } from "@/lib/hr/access";

/**
 * CLIENT ENGAGEMENT — who may do what (rebuilt 2026-09-28).
 *
 * Until now this was a hardcoded two-email allowlist (Manan, Ruchita) for
 * every one of the actions below — the account holder's own brief called
 * that out directly: "Only Super Admin, HR team can add or delete
 * participants and transfer participants and Ambassadors from 1 person to
 * the other — this feature is missing in the Client Engagement Module
 * completely." The two names above happen to already BE a super-admin and
 * HR staff, so this keeps admitting them — just by role, not by address.
 *
 *   ASSIGN an account out of Unassigned, TRANSFER one between employees, ADD
 *   one, DELETE one, manage the team roster, or edit anybody's schedule —
 *   super-admins and HR staff (`isHrStaff`, lib/hr/access.ts — the same rule
 *   `canPublishPolicies` uses for firm policies, and for the same reason: a
 *   role a namesake cannot borrow, and one a deploy is not needed to grant or
 *   revoke — adding or removing a manager is now an Employee Master change,
 *   department field, not a code change).
 *
 *   VIEW ANY EMPLOYEE'S CALENDAR — any admin, super-admin, or the above.
 *   Everyone else sees their own.
 *
 *   EDIT an account's details or SCHEDULE its calls — a manager, or the team
 *   member it is assigned to.
 *
 * These are enforced in the server actions; hiding a control is a
 * convenience, never the control.
 *
 * ASYNC, and reads the database (a department lookup via `isHrStaff`) —
 * hence `server-only`. lib/client-engagement/access.ts keeps the client-safe
 * leftovers (`CE_MANAGER_NAMES`, `CeActor`) so a client component can still
 * word a note without pulling this file in.
 */

/** Dummy mode signs in as this account; it may manage so the module is usable there. */
const DUMMY_EMAIL = "dummy.admin@example.invalid";

/** May this person assign, transfer, manage the roster and edit any schedule? */
export async function canManageCe(actor: Employee, dummyMode = false): Promise<boolean> {
  if (dummyMode && (actor.email ?? "").trim().toLowerCase() === DUMMY_EMAIL) return true;
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
