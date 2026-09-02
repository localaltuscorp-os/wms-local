import "server-only";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { apprConfig } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { getScorecardData, type ScorecardData } from "@/lib/appraisal2/data";
import type { WorkspacePerson } from "@/components/appraisal2/appraisal-workspace";

/**
 * Everything the Appraisal workbench needs to render, resolved ONCE.
 *
 * This was lifted verbatim out of `app/(app)/appraisal/page.tsx` when Appraisal
 * moved inside Team Productivity, for one reason: two pages now open the same
 * workbench (`/productivity/appraisal`, and `/appraisal` for anyone arriving on
 * an old link), and a scope rule copied into both is a scope rule that will
 * eventually differ between them. The rule itself is UNCHANGED — same roster
 * query, same admin test, same `getScorecardData` guard, same fallbacks.
 *
 * THE APPRAISAL PERMISSION MODEL, which is its own and deliberately not the
 * Productivity module's `directReportIds` rule:
 *   • Admin (or super-admin) — every active employee.
 *   • Anyone else — themselves, plus whoever they are the ASSIGNED manager or
 *     management for in `appr_config`. That assignment is what makes the manager
 *     and management scoring tiers usable, and it is not the same relation as
 *     the org chart's `manager_id`.
 *
 * The roster is only the picker's contents; it is never the authorisation.
 * `getScorecardData` re-checks the viewer against the requested employee on
 * every load, so a hand-edited `?emp=` cannot reach an out-of-scope scorecard —
 * it falls through to the picker prompt instead.
 */
export interface AppraisalWorkspaceData {
  roster: WorkspacePerson[];
  departments: string[];
  selectedId: string | null;
  data: ScorecardData | null;
  isAdmin: boolean;
}

export async function loadAppraisalWorkspace(emp?: string): Promise<AppraisalWorkspaceData> {
  requireAppraisal();
  const me = await requireUser();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  // Roster in scope. Admin → full active roster. Non-admin → self + anyone they
  // are assigned to as manager or management (so the manager tier is usable).
  let roster: WorkspacePerson[];
  if (isAdmin) {
    roster = await db
      .select({
        id: employees.id,
        name: employees.name,
        avatarUrl: employees.avatarUrl,
        department: employees.department,
      })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  } else {
    const assigned = await db
      .select({ employeeId: apprConfig.employeeId })
      .from(apprConfig)
      .where(or(eq(apprConfig.managerId, me.id), eq(apprConfig.managementId, me.id)));
    const ids = Array.from(new Set([me.id, ...assigned.map((a) => a.employeeId)]));
    roster = await db
      .select({
        id: employees.id,
        name: employees.name,
        avatarUrl: employees.avatarUrl,
        department: employees.department,
      })
      .from(employees)
      .where(and(eq(employees.isActive, true), inArray(employees.id, ids)))
      .orderBy(asc(employees.name));
  }

  const departments = Array.from(
    new Set(roster.map((p) => p.department).filter((d): d is string => !!d)),
  ).sort((a, b) => a.localeCompare(b));

  // Selected employee: explicit ?emp=, else self (non-admins land on their own).
  const selectedId = emp ?? (isAdmin ? null : me.id);

  let data: ScorecardData | null = null;
  if (selectedId) {
    try {
      data = await getScorecardData(selectedId, me);
    } catch {
      data = null; // Forbidden / not in scope → render the picker prompt.
    }
  }

  return { roster, departments, selectedId, data, isAdmin };
}
