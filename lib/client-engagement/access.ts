/**
 * CLIENT ENGAGEMENT — who may do what.
 *
 *   ASSIGN an account out of the Unassigned pool, or TRANSFER one between
 *   employees — MANAN and RUCHITA only (brief, confirmed 2026-09-18). Nobody
 *   else, admins included: an admin flag is held by more people than the brief
 *   names. The same two people manage the team roster and may edit anybody's
 *   schedule.
 *
 *   VIEW ANY EMPLOYEE'S CALENDAR — admins and super-admins, plus the two above.
 *   Everyone else sees their own.
 *
 *   ADD an account — anyone signed in. It lands in Unassigned, so adding one
 *   hands nobody any work.
 *
 *   EDIT an account's details or SCHEDULE its calls — a manager, or the team
 *   member it is assigned to.
 *
 * These are enforced in the server actions; hiding a control is a convenience,
 * never the control.
 *
 * Matched by EMAIL first — the identity a namesake cannot borrow — with a
 * first-name fallback for an account whose address differs from the one here.
 *
 * PURE: reads no database and no environment, so the rules are unit-tested.
 */

export interface CeActor {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  isAdmin?: boolean | null;
}

const MANAGERS_BY_EMAIL: readonly string[] = ["manan@unleashed.in", "ruchitaambre.altuscorp@gmail.com"];

/** First names, matched as whole words so "Mananjay" is not Manan. */
const MANAGERS_BY_NAME: readonly string[] = ["manan", "ruchita"];

/** Dummy mode signs in as this account; it may manage so the module is usable there. */
const DUMMY_EMAIL = "dummy.admin@example.invalid";

export const CE_MANAGER_NAMES = "Manan and Ruchita";

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** May this person assign, transfer, manage the roster and edit any schedule? */
export function canManageCe(actor: CeActor, dummyMode = false): boolean {
  const email = norm(actor.email);
  if (dummyMode && email === DUMMY_EMAIL) return true;
  if (email && MANAGERS_BY_EMAIL.includes(email)) return true;
  const firstName = norm(actor.name).split(/\s+/)[0] ?? "";
  return firstName.length > 0 && MANAGERS_BY_NAME.includes(firstName);
}

/** May this person pick any employee's calendar, not just their own? */
export function canViewAnyCalendar(actor: CeActor, isSuperAdmin: boolean, dummyMode = false): boolean {
  return Boolean(actor.isAdmin) || isSuperAdmin || canManageCe(actor, dummyMode);
}

/**
 * May this person edit an account (details, status, its calls)? A manager may
 * edit any; a team member may edit the ones assigned to them.
 *
 * `assigneeEmployeeId` is the login behind the account's assignee, or null when
 * it is unassigned or the assignee has no login.
 */
export function canEditAccount(
  actor: CeActor,
  assigneeEmployeeId: string | null,
  dummyMode = false,
): boolean {
  if (canManageCe(actor, dummyMode)) return true;
  return Boolean(actor.id && assigneeEmployeeId && actor.id === assigneeEmployeeId);
}
