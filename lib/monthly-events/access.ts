import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment } from "@/lib/workspaces";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Monthly Events Master module (design §1).
 *
 * The admin surface (calendar, masters, batches, obligations) is for
 * SUPER-ADMINS, admins (`isAdmin`), and — optionally — the Founder Office
 * department. `isAdmin` in the returned object means "may edit masters / manage
 * schedules". (Holidays were removed from this module — they live in HR; the
 * employee holiday list at `/holidays` is served by the HR room.)
 */
export interface EventsAccess {
  me: Employee;
  isAdmin: boolean;
}

/** Departments (word-matched) that may VIEW the events module without being
 *  admins. Kept minimal per spec — the Founder Office. */
const EVENTS_VIEW_DEPARTMENTS = ["Founder"];

/**
 * Compute the events access for an ALREADY-RESOLVED employee (no web session
 * read). This is the single source of truth for the department gate; both the
 * web `eventsAccess()` (which resolves via `requireUser()`) and the native
 * mobile API (which resolves via Firebase-bearer `authenticateMobileRequest`)
 * call through here so the two surfaces can never diverge.
 */
export async function eventsAccessForEmployee(
  me: Employee,
): Promise<EventsAccess | null> {
  const isAdmin = isSuperAdmin(me.email) || me.isAdmin;
  if (isAdmin) return { me, isAdmin: true };

  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  if (EVENTS_VIEW_DEPARTMENTS.some((d) => matchesDepartment(departments, d))) {
    return { me, isAdmin: false };
  }
  return null;
}

export async function eventsAccess(): Promise<EventsAccess | null> {
  const me = await requireUser();
  return eventsAccessForEmployee(me);
}

/** For pages: returns access or redirects to /hub if not allowed. Re-assert in
 *  EVERY page (layout gates are unreliable on prod). */
export async function requireEventsAccess(): Promise<EventsAccess> {
  const access = await eventsAccess();
  if (!access) redirect("/hub" as Route);
  return access;
}

/** For admin-only surfaces (masters / batches / obligations): returns access or
 *  redirects viewers back to the events sub-hub. */
export async function requireEventsAdmin(): Promise<EventsAccess> {
  const access = await requireEventsAccess();
  if (!access.isAdmin) redirect("/events" as Route);
  return access;
}
