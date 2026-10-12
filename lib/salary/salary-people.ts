import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";

/**
 * WHO A VIEWER MAY OPEN IN "MY SALARY".
 *
 * My Salary is self-only by default. HR administrators receive organization-wide
 * access, gated SERVER-SIDE so the `?emp=` query string can never widen anyone's reach.
 * Super-admins, and employees who are both HR staff and Admins, may view every
 * active employee. Everyone else remains self-only.
 *   · anyone else          → only themself (unchanged; no picker shown).
 *
 * Salary is sensitive, so `canViewSalaryOf` is the single choke point: the page
 * resolves the target through it, and refuses to load a stranger's pay even if
 * the id is hand-typed into the URL.
 */

export interface SalaryPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** self = no picker; team = self + downline; all = every active employee. */
export type SalaryScope = "self" | "team" | "all";

export interface SalaryViewAccess {
  scope: SalaryScope;
  /** The selectable people for the picker (empty when scope === "self"). */
  people: SalaryPerson[];
}

type Viewer = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  department: string | null;
  /** Optional because the access checks do not need it; only `resolveSalaryTarget`
   *  does, and it reads the signed-in employee's own row when the viewer IS the
   *  target. */
  workerType?: string | null;
};

async function canViewOrganisationSalary(
  me: Pick<Viewer, "id" | "isAdmin" | "email" | "department">,
): Promise<boolean> {
  if (isSuperAdmin(me.email)) return true;
  return me.isAdmin && await isHrStaff(me);
}

/** The people this viewer may open in My Salary, and which scope they fall under. */
export async function loadSalaryViewAccess(me: Viewer): Promise<SalaryViewAccess> {
  if (await canViewOrganisationSalary(me)) {
    const people = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
    return { scope: "all", people };
  }

  return { scope: "self", people: [] };

  // A manager sees their own pay alongside the team's — self first, then reports.
}

/**
 * The one gate the page trusts. Self is always allowed; super-admins and HR
 * administrators reach anyone. Everything else is refused,
 * so a hand-typed `?emp=` for someone out of scope silently falls back to self.
 */
export async function canViewSalaryOf(
  me: Pick<Viewer, "id" | "isAdmin" | "email" | "department">,
  targetId: string,
): Promise<boolean> {
  if (targetId === me.id) return true;
  if (await canViewOrganisationSalary(me)) return true;
  return false;
}

/**
 * WHO A PAY PAGE IS ABOUT — the `?emp=` in the URL, resolved against the gate
 * above, plus the two facts the pay engine needs about that person.
 *
 * Both salary surfaces (My Salary and its Salary Statement) have to answer this
 * identically: a hand-typed id they disagree about would be a page somebody can
 * see and its statement somebody cannot. One function, so they cannot.
 *
 * An id the viewer may not open falls back to THEMSELVES rather than erroring —
 * the same behaviour My Salary has always had, and the safer direction to fail.
 */
export async function resolveSalaryTarget(
  me: Pick<Viewer, "id" | "name" | "isAdmin" | "email" | "department" | "workerType">,
  empParam: string | null | undefined,
): Promise<{ targetId: string; name: string; workerType: string | null }> {
  if (!empParam || empParam === me.id) {
    return { targetId: me.id, name: me.name, workerType: me.workerType ?? null };
  }
  if (!(await canViewSalaryOf(me, empParam))) {
    return { targetId: me.id, name: me.name, workerType: me.workerType ?? null };
  }
  const row = await db.query.employees.findFirst({
    where: eq(employees.id, empParam),
    columns: { workerType: true, name: true },
  });
  if (!row) return { targetId: me.id, name: me.name, workerType: me.workerType ?? null };
  return { targetId: empParam, name: row.name, workerType: row.workerType ?? null };
}
