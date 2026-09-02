import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { employeeIdsInDepartments } from "@/lib/queries/departments";
import { DEPARTMENTS, type Department } from "@/db/enums";
import { teamOption } from "@/lib/teams/roster";

/**
 * Resolve the toolbar's Team filter to a concrete set of employee ids.
 *
 * Three shapes, all arriving as the `team` URL param:
 *   • "t1".."t6"    — a STANDING TEAM: the manager it is rooted at, plus their
 *                     whole branch at any depth. The only shape the dropdown
 *                     still offers; see lib/teams/roster.ts.
 *   • "mine"        — the viewer PLUS everyone below them in the org chart, at
 *                     any depth. Not just direct reports: a manager asking for
 *                     "my team" means the whole branch, and stopping at depth 1
 *                     would silently hide the work of anyone reporting to a lead.
 *   • a department  — everyone in that department, via the same membership join
 *                     the existing `dept` filter uses, so the two agree.
 *
 * The last two are RETIRED from the picker but still resolved here, so links and
 * bookmarks saved before the T1..T6 switch keep working rather than silently
 * widening to the whole org.
 *
 * Returns `null` when the value is unrecognised or the viewer is unknown —
 * callers treat that as "no team scoping" rather than "match nothing", so a
 * stale bookmark degrades to the unfiltered list instead of an empty screen.
 */
export async function resolveTeamScope(
  team: string | null,
  viewerId: string | null,
): Promise<string[] | null> {
  if (!team) return null;

  // A standing team resolves to its manager's whole branch. Matched by EMAIL
  // (see lib/teams/roster.ts) so a rename cannot empty the team out.
  const standing = teamOption(team);
  if (standing) {
    const [manager] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(sql`lower(${employees.email}) = ${standing.managerEmail.toLowerCase()}`)
      .limit(1);
    // No such employee (wrong address, or they were removed) — treat it as "no
    // team scoping" like any other unrecognised value, rather than matching
    // nothing and showing an empty screen.
    if (!manager) return null;
    return descendantsIncluding(manager.id);
  }

  if (team === "mine") {
    if (!viewerId) return null;
    return descendantsIncluding(viewerId);
  }

  if ((DEPARTMENTS as readonly string[]).includes(team)) {
    const ids = await employeeIdsInDepartments([team as Department]);
    // An empty department is a real answer — return the empty array so the
    // caller shows "no tasks", not the whole org.
    return ids;
  }

  return null;
}

/**
 * `rootId` plus every active employee beneath it, at any depth.
 *
 * One scan of the active org, then an in-memory walk: the tree is a few dozen
 * rows, and a recursive CTE for that is more machinery than the problem needs.
 * The `seen` guard makes a cyclic manager_id terminate — nothing in the schema
 * forbids A→B→A, and a cycle here would otherwise hang the request.
 */
async function descendantsIncluding(rootId: string): Promise<string[]> {
  const rows = await db
    .select({ id: employees.id, managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.isActive, true));

  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.managerId) continue;
    const list = childrenOf.get(r.managerId) ?? [];
    list.push(r.id);
    childrenOf.set(r.managerId, list);
  }

  const out = new Set<string>([rootId]);
  const queue = [...(childrenOf.get(rootId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return [...out];
}

/**
 * Resolve SEVERAL team selections to one id set — their UNION.
 *
 * Union, not intersection: the selections are alternatives ("Sales or App
 * Dev"), and since nobody belongs to two departments the intersection would be
 * empty for every multi-pick, which is never what ticking two boxes means.
 *
 * Selections that resolve to null (unrecognised, or "mine" with no viewer) are
 * SKIPPED rather than collapsing the whole scope, so one stale value in a
 * shared link cannot silently widen the list back to the entire org. If every
 * selection is unrecognised the result is null = no team scoping, matching the
 * single-value behaviour.
 */
export async function resolveTeamScopes(
  teams: string[],
  viewerId: string | null,
): Promise<string[] | null> {
  if (teams.length === 0) return null;
  const resolved = await Promise.all(teams.map((t) => resolveTeamScope(t, viewerId)));
  const usable = resolved.filter((r): r is string[] => r !== null);
  if (usable.length === 0) return null;
  return Array.from(new Set(usable.flat()));
}
