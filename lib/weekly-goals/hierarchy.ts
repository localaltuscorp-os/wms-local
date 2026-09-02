import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Org-chart helpers for Weekly-Goals manager permissions.
 *
 * A "manager" is anyone who has people reporting to them via
 * `employees.manager_id`. Managers may create/manage weekly goals for
 * themselves AND their FULL DOWNLINE (transitive: reports, reports-of-reports,
 * all the way down). Admins keep their org-wide reach; everyone else is scoped
 * to themselves only. Review/approve/archive stay super-admin only and are NOT
 * touched here.
 */

/**
 * Every employee id transitively below `managerId` (reports, reports-of-reports,
 * …), via a recursive CTE over `employees.manager_id`. Excludes `managerId`
 * itself and inactive employees. Fail-safe: returns [] on any error.
 */
export async function getDownlineIds(managerId: string): Promise<string[]> {
  try {
    const rows = (await db.execute(sql`
      WITH RECURSIVE downline AS (
        SELECT id
        FROM employees
        WHERE manager_id = ${managerId}
          AND is_active = true
        UNION
        SELECT e.id
        FROM employees e
        INNER JOIN downline d ON e.manager_id = d.id
        WHERE e.is_active = true
      )
      SELECT id FROM downline WHERE id <> ${managerId}
    `)) as unknown as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/**
 * The goal-management scope for the signed-in user:
 *  - admin → { all: true, ids: [] } (manages anyone)
 *  - else  → { all: false, ids: [me.id, ...downline] } (always includes self)
 */
export async function goalScopeFor(me: {
  id: string;
  isAdmin: boolean;
}): Promise<{ all: boolean; ids: string[] }> {
  if (me.isAdmin) return { all: true, ids: [] };
  const downline = await getDownlineIds(me.id);
  return { all: false, ids: [me.id, ...downline] };
}

/** Whether `scope` is allowed to create/manage a goal for `targetEmployeeId`. */
export function canManageGoalFor(
  scope: { all: boolean; ids: string[] },
  targetEmployeeId: string,
): boolean {
  return scope.all || scope.ids.includes(targetEmployeeId);
}
