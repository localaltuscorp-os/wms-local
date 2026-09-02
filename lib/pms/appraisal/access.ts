import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { goalScopeFor, getDownlineIds } from "@/lib/goals/scope";
import type { Employee } from "@/db/schema";

/** Admin = org-wide reach (isAdmin flag OR a super-admin email). */
export function isAppraisalAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** True when this person has at least one active direct report → a "manager",
 *  which unlocks the manager-only subjective dimensions on THEIR scorecard. */
export async function isManagerEmployee(employeeId: string): Promise<boolean> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.managerId, employeeId), eq(employees.isActive, true)))
    .limit(1);
  return rows.length > 0;
}

/** Which employee ids have ≥1 active report, over a candidate set (one query). */
export async function managerFlags(
  employeeIds: string[],
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const rows = await db
    .select({ managerId: employees.managerId })
    .from(employees)
    .where(and(eq(employees.isActive, true), inArray(employees.managerId, employeeIds)));
  const set = new Set<string>();
  for (const r of rows) if (r.managerId) set.add(r.managerId);
  return set;
}

export interface AppraisalScope {
  /** Admin — sees + manages everyone. */
  all: boolean;
  /** For a manager: [self, ...downline]; for a plain employee: [self]. */
  ids: string[];
}

/** The roster scope for the signed-in user (mirrors goalScopeFor). */
export async function appraisalScopeFor(me: Employee): Promise<AppraisalScope> {
  return goalScopeFor({ id: me.id, isAdmin: isAppraisalAdmin(me) });
}

/** Can `me` VIEW `targetId`'s appraisal? admin=all, else self+downline. */
export async function canViewAppraisal(
  me: Employee,
  targetId: string,
): Promise<boolean> {
  if (isAppraisalAdmin(me)) return true;
  if (me.id === targetId) return true;
  const downline = await getDownlineIds(me.id);
  return downline.includes(targetId);
}

/** Can `me` act as the MANAGER scorer for `targetId`? (direct-or-indirect
 *  report; admins may also step in). */
export async function canManagerScore(
  me: Employee,
  targetId: string,
): Promise<boolean> {
  if (me.id === targetId) return false;
  if (isAppraisalAdmin(me)) return true;
  const downline = await getDownlineIds(me.id);
  return downline.includes(targetId);
}
