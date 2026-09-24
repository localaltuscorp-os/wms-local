import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { loadSortOrders } from "@/lib/employees/sort-order";

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
  /** Manual position among siblings sharing the same manager (0251), or null
   *  for "no manual order yet" / the database doesn't have 0251. */
  sortOrder: number | null;
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
export async function getHierarchy(
  opts: {
    /**
     * "size" (default) — Admin › Reporting Hierarchy's board: a column per
     * person with reports, biggest team first.
     *
     * "tree" — Operations › Team Reporting: columns in the ORG'S OWN ORDER, and
     * every second-level person is a column even with nobody under them yet.
     * See the block below for what "own order" means and why.
     */
    layout?: "size" | "tree";
  } = {},
): Promise<HierarchySnapshot> {
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
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  const sortOrders = await loadSortOrders();

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
    sortOrder: sortOrders.get(r.id) ?? null,
  }));

  const byId = new Map(people.map((p) => [p.id, p]));

  const reportsOf = (managerId: string): HierarchyPerson[] =>
    (reportsByManager.get(managerId) ?? [])
      .map((r) => byId.get(r.id))
      .filter((p): p is HierarchyPerson => Boolean(p));

  const toColumn = (managerId: string, reports: HierarchyPerson[]): HierarchyColumn => {
    const mgr = byId.get(managerId);
    return {
      managerId,
      managerName: mgr?.name ?? "Former employee",
      managerEmail: mgr?.email ?? null,
      reports,
    };
  };

  /**
   * THE ORDER PEOPLE WERE ADDED, with the id as a tiebreak.
   *
   * The tree layout is asked to keep a fixed, human order - not alphabetical
   * and not by team size. The only ordering the roster actually records is
   * when each person was added (`created_at`), which is also the order an org
   * chart is naturally built in: the head first, then the people under them in
   * the order they joined. The id breaks ties for rows inserted in the same
   * instant (a bulk import), so the board never reshuffles between renders.
   */
  const joinedAt = new Map(staff.map((r) => [r.id, r.createdAt.getTime()]));
  const byJoin = (a: HierarchyPerson, b: HierarchyPerson) =>
    (joinedAt.get(a.id) ?? 0) - (joinedAt.get(b.id) ?? 0) || a.id.localeCompare(b.id);
  const byName = (a: HierarchyPerson, b: HierarchyPerson) => a.name.localeCompare(b.name);
  // A manual sort_order (0251) wins over join order whenever EITHER side has
  // one set — Team Reporting's card/column reorder. Neither set → falls
  // through to byJoin unchanged, so a database/roster with no manual order
  // yet behaves exactly as before.
  const byManualThenJoin = (a: HierarchyPerson, b: HierarchyPerson) =>
    a.sortOrder !== null || b.sortOrder !== null
      ? (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
      : byJoin(a, b);

  let columns: HierarchyColumn[];
  let unassigned: HierarchyPerson[];

  if (opts.layout === "tree") {
    /**
     * TREE: walk the org top-down, breadth first, and emit columns in the
     * order the walk reaches them - the head's column, then one column per
     * person directly under the head, then THEIR teams, and so on.
     *
     * A second-level person is a column even with nobody under them yet: on an
     * org chart they are a manager slot that is simply empty today, and hiding
     * the column until somebody is moved in made the chart disagree with the
     * org it is drawing. Below the second level a column still needs reports -
     * otherwise every individual contributor would become an empty column.
     */
    const roots = people.filter((p) => !p.managerId).sort(byManualThenJoin);
    const rootIds = new Set(roots.map((p) => p.id));
    const queue: HierarchyPerson[] = [...roots];
    const walked = new Set<string>();
    columns = [];
    while (queue.length > 0) {
      const person = queue.shift()!;
      if (walked.has(person.id)) continue;
      walked.add(person.id);
      const reports = reportsOf(person.id).sort(byManualThenJoin);
      const secondLevel = person.managerId !== null && rootIds.has(person.managerId);
      if (reports.length > 0 || secondLevel) columns.push(toColumn(person.id, reports));
      queue.push(...reports);
    }
    // A team whose manager has left the active roster is unreachable from any
    // root. It must still appear - dropping it would hide real people.
    for (const managerId of reportsByManager.keys()) {
      if (!walked.has(managerId)) columns.push(toColumn(managerId, reportsOf(managerId).sort(byManualThenJoin)));
    }
    unassigned = roots;
  } else {
    // SIZE (unchanged): a column for every person who HAS reports, biggest
    // team first, so the founder's column leads and the board does not
    // reshuffle every time somebody is renamed.
    columns = [...reportsByManager.keys()]
      .map((managerId) => toColumn(managerId, reportsOf(managerId).sort(byName)))
      .sort((a, b) => b.reports.length - a.reports.length || a.managerName.localeCompare(b.managerName));
    unassigned = people.filter((p) => !p.managerId).sort(byName);
  }

  // THE UNASSIGNED COLUMN, always present even when empty, and LEADS the
  // board (asked 2026-09-22): the gap that most needs to be seen — nobody
  // above them in the chart — should not be the last column somebody scrolls
  // to. Manan, its founder, then sorts first within it, so the board's very
  // first two entries read "no manager assigned" then "Manan".
  //
  // People with no manager have to be somewhere, or the only way to give
  // somebody their first manager would be to already know they exist. It is
  // also where a genuine gap shows up: managers themselves currently have no
  // manager assigned, so this column legitimately holds them.
  columns.unshift({
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
