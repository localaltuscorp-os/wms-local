import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

/**
 * WHO A VIEWER MAY OPEN IN "MY SALARY".
 *
 * My Salary was self-only. This adds two wider scopes, both gated SERVER-SIDE so
 * the `?emp=` query string can never widen anyone's reach:
 *   · admin / super-admin  → EVERYONE (they already own the full Accounts salary
 *     module; this is the same reach on the self-service page).
 *   · a manager            → THEMSELF + their FULL transitive downline (the same
 *     `getDownlineIds` tree the weekly-goals / attendance team views use).
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
  /** Optional because the access checks do not need it; only `resolveSalaryTarget`
   *  does, and it reads the signed-in employee's own row when the viewer IS the
   *  target. */
  workerType?: string | null;
};

function viewerIsAdmin(me: Pick<Viewer, "isAdmin" | "email">): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** The people this viewer may open in My Salary, and which scope they fall under. */
export async function loadSalaryViewAccess(me: Viewer): Promise<SalaryViewAccess> {
  if (viewerIsAdmin(me)) {
    const people = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
    return { scope: "all", people };
  }

  const downline = await getDownlineIds(me.id);
  if (downline.length === 0) return { scope: "self", people: [] };

  const reports = await db
    .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
    .from(employees)
    .where(and(eq(employees.isActive, true), inArray(employees.id, downline)))
    .orderBy(asc(employees.name));

  // A manager sees their own pay alongside the team's — self first, then reports.
  return {
    scope: "team",
    people: [{ id: me.id, name: me.name, avatarUrl: me.avatarUrl }, ...reports],
  };
}

/**
 * The one gate the page trusts. Self is always allowed; admins reach anyone;
 * a manager reaches only their transitive downline. Everything else is refused,
 * so a hand-typed `?emp=` for someone out of scope silently falls back to self.
 */
export async function canViewSalaryOf(
  me: Pick<Viewer, "id" | "isAdmin" | "email">,
  targetId: string,
): Promise<boolean> {
  if (targetId === me.id) return true;
  if (viewerIsAdmin(me)) return true;
  const downline = await getDownlineIds(me.id);
  return downline.includes(targetId);
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
  me: Pick<Viewer, "id" | "name" | "isAdmin" | "email" | "workerType">,
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
