import "server-only";
import type { Employee } from "@/db/schema";
import { isHrStaff } from "@/lib/hr/access";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import { employeeDepartmentNames } from "@/lib/queries/departments";

/**
 * Who may do what in Hand-holding.
 *
 * Editing and deleting a PERSON is limited to Admin and Ruchita, because
 * removing a person takes their entries and their calls with them. Adding is
 * wider still: HR can add too, without being an admin.
 *
 * HR membership is NOT re-derived here — `employees.department` is only half
 * the picture (the structured employee_departments table is the other half), so
 * this defers to lib/hr/access, the one place that knows the full rule.
 *
 * Entries (participants/clients) are deliberately not gated here — adding,
 * holding and deleting a row is the working use of the page.
 */

/** Named in the brief as a roster owner alongside HR. */
const ROSTER_OWNERS = ["ruchita"];

function isRosterOwner(me: Employee): boolean {
  return ROSTER_OWNERS.some((n) => (me.name ?? "").toLowerCase().includes(n));
}

/**
 * Admins and Ruchita. A person carries their entries and calls with them, so
 * this stays a short list — but Ruchita owns the roster day to day and now
 * edits and deletes on it as well as adding.
 */
export function canEditPerson(me: Employee): boolean {
  return Boolean(me.isAdmin) || isRosterOwner(me);
}

/**
 * All Participants, by role:
 *
 *   Admin    — add, view, edit, delete
 *   Ruchita  — add, view, edit, delete
 *   HR       — add and view ONLY: no edit, no delete
 *
 * Edit and delete answer the same question, so they are the same predicate. HR
 * is deliberately absent from it: HR's reach is `canAddPerson`, which is wider
 * on purpose and must not be mistaken for this one.
 *
 * The named accounts remain as a fallback for identities whose admin flag or
 * email differs; email is matched first, being the identity a namesake cannot
 * borrow.
 */
const PARTICIPANT_DELETERS = ["manan@unleashed.in", "ruchitaambre.altuscorp@gmail.com"];
const PARTICIPANT_DELETER_NAMES = ["manan", "ruchita"];

function isParticipantOwner(me: Employee): boolean {
  if (me.isAdmin) return true;
  const email = (me.email ?? "").toLowerCase().trim();
  if (PARTICIPANT_DELETERS.includes(email)) return true;
  const name = (me.name ?? "").toLowerCase();
  return PARTICIPANT_DELETER_NAMES.some((n) => name.includes(n));
}

/**
 * Deleting a participant — MANAN and RUCHITA by name, on every surface: the All
 * Participants table and the PS / BSS section rows alike. An admin flag is not
 * enough; deletion belongs to two people, not to a role.
 *
 * Editing is the wider rule (`canEditParticipant`) — Admin and Ruchita — so the
 * two must not be collapsed into one predicate.
 */
export function canDeleteParticipant(me: Employee): boolean {
  return canDeleteSectionEntry(me);
}

/**
 * Removing a participant ROW from a section (PS, BSS, Retainer, Eco System) —
 * MANAN and RUCHITA by name, and nobody else. An admin flag is NOT enough:
 * these rows carry the participant's calls with them, and the brief names two
 * people rather than a role.
 */
export function canDeleteSectionEntry(me: Employee): boolean {
  const email = (me.email ?? "").toLowerCase().trim();
  if (PARTICIPANT_DELETERS.includes(email)) return true;
  const name = (me.name ?? "").toLowerCase();
  return PARTICIPANT_DELETER_NAMES.some((n) => name.includes(n));
}

/** Admin and Ruchita. HR may not edit — it adds and views, nothing more. */
export function canEditParticipant(me: Employee): boolean {
  return isParticipantOwner(me);
}

/**
 * Who may open the ADMIN PANEL — Manan Vasa and the Accountant, and nobody
 * else. Deliberately narrower than every other rule in this file: admins and HR
 * are NOT included, so `canAddPerson` must not be reused for it.
 *
 * "Accountant" is resolved the way the attendance module already resolves it —
 * membership of the Accounts department, read from the structured table AND the
 * employee's own column, since either half can carry it.
 */
const ADMIN_PANEL_EMAILS = ["manan@unleashed.in"];
const ADMIN_PANEL_NAMES = ["manan"];

export async function canAccessAdminPanel(me: Employee): Promise<boolean> {
  const email = (me.email ?? "").toLowerCase().trim();
  if (ADMIN_PANEL_EMAILS.includes(email)) return true;
  const name = (me.name ?? "").toLowerCase();
  if (ADMIN_PANEL_NAMES.some((n) => name.includes(n))) return true;

  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  return matchesDepartment(departments, ACCOUNTS_DEPARTMENT);
}

/** Admins, HR, and the named roster owners. */
export async function canAddPerson(me: Employee): Promise<boolean> {
  if (me.isAdmin || isRosterOwner(me)) return true;
  return isHrStaff(me);
}
