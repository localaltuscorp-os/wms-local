import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";

/**
 * THE REPORTING HIERARCHY, read for the Kanban org view.
 *
 * ── ONE QUERY, TREE ASSEMBLED IN MEMORY ────────────────────────────────────
 * The whole active roster is ~30 rows. A recursive CTE per manager, or a query
 * per column, would be more code and more round trips to arrange the same
 * handful of records — so this reads the roster once and groups it by
 * `manager_id`. The recursive walks in `lib/weekly-goals/hierarchy.ts` exist for
 * a different question ("everybody below this person", asked of one person on a
 * hot path) and stay where they are.
 *
 * The board renders MANAGERS AS COLUMNS, which is the brief's shape:
 *
 *     Manan            Rohan
 *      ├── Rohan        ├── Employee A
 *      ├── Rutvisha     └── Employee B
 *      └── Rudra
 *
 * Note that Rohan appears twice — once as one of Manan's reports and once as a
 * column of his own. That is not a duplication bug; it is what a middle manager
 * is, and the board says so explicitly rather than hiding one of the two.
 */

export interface HierarchyPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  designationId: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  managerId: string | null;
  /** How many people report to THEM — what makes somebody a column. */
  reportCount: number;
}

export interface HierarchyColumn {
  /** Null for the "No manager assigned" column. */
  managerId: string | null;
  managerName: string;
  managerEmail: string | null;
  reports: HierarchyPerson[];
}

export interface HierarchySnapshot {
  people: HierarchyPerson[];
  columns: HierarchyColumn[];
  /** Ids with no manager AND no reports — listed so nobody is invisible. */
  unassignedCount: number;
}

/**
 * The whole active hierarchy.
 *
 * ACTIVE STAFF ONLY. Former employees keep their `manager_id` (offboarding
 * preserves the row deliberately — migration 0212), and putting them on the
 * board would fill it with people who left. Their history is still readable
 * through `managerHistoryFor`.
 */
export async function getHierarchy(): Promise<HierarchySnapshot> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      department: employees.department,
      designationId: employees.designationId,
      avatarUrl: employees.avatarUrl,
      isAdmin: employees.isAdmin,
      managerId: employees.managerId,
      accountType: employees.accountType,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  // Candidates and system accounts are excluded here rather than in the WHERE
  // clause: candidates are always `is_active = false` (so the filter above
  // already drops them) but system/demo logins are deliberately inactive too,
  // and the isActive filter would let a future active one through. Filtering on
  // the archetype states the intent.
  const staff = rows.filter((r) => r.accountType === "employee");

  const reportsByManager = new Map<string, typeof staff>();
  for (const r of staff) {
    const key = r.managerId;
    if (!key) continue;
    const list = reportsByManager.get(key);
    if (list) list.push(r);
    else reportsByManager.set(key, [r]);
  }

  const people: HierarchyPerson[] = staff.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    department: r.department,
    designationId: r.designationId,
    avatarUrl: r.avatarUrl,
    isAdmin: r.isAdmin,
    managerId: r.managerId,
    reportCount: reportsByManager.get(r.id)?.length ?? 0,
  }));

  const byId = new Map(people.map((p) => [p.id, p]));

  // A column for every person who HAS reports. Ordered by team size then name,
  // so the founder's column leads and the board does not reshuffle every time
  // somebody is renamed.
  const columns: HierarchyColumn[] = [...reportsByManager.entries()]
    .map(([managerId, reports]) => {
      const mgr = byId.get(managerId);
      return {
        managerId,
        managerName: mgr?.name ?? "Former employee",
        managerEmail: mgr?.email ?? null,
        reports: reports
          .map((r) => byId.get(r.id))
          .filter((p): p is HierarchyPerson => Boolean(p))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length || a.managerName.localeCompare(b.managerName));

  // THE UNASSIGNED COLUMN, always present even when empty.
  //
  // People with no manager have to be somewhere, or the only way to give
  // somebody their first manager would be to already know they exist. It is
  // also where a genuine gap shows up: managers themselves currently have no
  // manager assigned, so this column legitimately holds them.
  const unassigned = people
    .filter((p) => !p.managerId)
    .sort((a, b) => a.name.localeCompare(b.name));

  columns.push({
    managerId: null,
    managerName: "No manager assigned",
    managerEmail: null,
    reports: unassigned,
  });

  return {
    people,
    columns,
    unassignedCount: unassigned.filter((p) => p.reportCount === 0).length,
  };
}
