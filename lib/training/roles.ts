import "server-only";
import type { Employee } from "@/db/schema";
import type { LearningRoleGroup } from "@/db/enums";
import { isFounderEmail } from "@/lib/auth/founder";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManagerWithReports } from "@/lib/manager-gates";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

/**
 * THE TWO TRAINER CLASSES, per spec §3: a Team Lead / Manager, or Manan. The
 * trainer is independent from the reporting hierarchy — TL B may train Employee
 * A who reports to TL A — so this is an eligibility predicate, NOT a hierarchy
 * lookup.
 */
export async function canTrain(emp: Employee): Promise<boolean> {
  if (isFounderEmail(emp.email)) return true;
  if (emp.isTeamLead) return true;
  return isManagerWithReports(emp.id);
}

/** Training CRUD: a trainer can create/edit/cancel; admins/supers can too. */
export async function canManageTraining(emp: Employee): Promise<boolean> {
  return emp.isAdmin || isSuperAdmin(emp.email) || (await canTrain(emp));
}

/**
 * The learning cohort an employee belongs to, for target resolution. Derived
 * from the existing flags — never a stored role. Manan (founder) is its own
 * cohort; team leads are `tl`; anyone who manages a downline (or is admin) is
 * `manager`; everyone else is `employee`.
 */
export async function learningRoleGroupFor(emp: Employee): Promise<LearningRoleGroup> {
  if (isFounderEmail(emp.email)) return "manan";
  if (emp.isTeamLead) return "tl";
  if (emp.isAdmin || (await isManagerWithReports(emp.id))) return "manager";
  return "employee";
}

/**
 * Employee ids whose learning data `viewer` may see — self plus the downline,
 * the same recursive-CTE primitive every other module uses. Admins and Manan
 * return `[]`, meaning "no restriction" (the caller renders an unfiltered
 * query). Fail-closed to self-only on error.
 */
export async function learningVisibleIds(viewer: Employee): Promise<string[]> {
  if (viewer.isAdmin || isFounderEmail(viewer.email)) return [];
  const downline = await getDownlineIds(viewer.id).catch(() => [] as string[]);
  return [viewer.id, ...downline];
}
