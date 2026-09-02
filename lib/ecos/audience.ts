import "server-only";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, employeeDepartments } from "@/db/schema";
import type { WorkerType, EmployeeRole } from "@/db/enums";

/**
 * Enterprise Communications (ECOS, migration 0179) — audience resolver.
 *
 * A broadcast targets its recipients through an `AudienceRule` stored on the
 * `broadcasts.audience` JSONB column. `resolveAudience` turns that rule into a
 * concrete, de-duplicated, ALWAYS-active-only set of employee ids at PUBLISH
 * time (the result is snapshotted into `broadcast_recipients`).
 *
 * SEMANTICS (documented, load-bearing — the composer's live count relies on it):
 *   - scope "org"    → every active employee. All other fields are ignored.
 *   - scope "custom" → the UNION of every explicitly-provided target set. An
 *     employee is included if they match ANY of:
 *       • departmentIds  — their primary `department_id` OR any
 *                          `employee_departments` (many-to-many) membership
 *       • designationIds — their `designation_id`
 *       • workerTypes    — their `worker_type`
 *       • roles          — their `role`
 *       • managerId      — their `manager_id` (direct reports of one manager)
 *       • employeeIds    — hand-picked individuals
 *     Empty/omitted lists contribute nothing. A custom rule with no lists at
 *     all resolves to ZERO recipients (nobody was selected).
 *   - Inactive employees are NEVER included, under any scope.
 */
export interface AudienceRule {
  scope: "org" | "custom";
  departmentIds?: string[];
  designationIds?: string[];
  workerTypes?: string[];
  roles?: string[];
  managerId?: string;
  employeeIds?: string[];
}

/** Trim, drop empties, de-dupe a string list (or return [] for undefined). */
function clean(list: string[] | undefined): string[] {
  if (!list || list.length === 0) return [];
  const seen = new Set<string>();
  for (const raw of list) {
    const v = (raw ?? "").trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

export async function resolveAudience(
  rule: AudienceRule,
): Promise<{ employeeIds: string[]; count: number }> {
  // Org-wide → every active employee, ignore the rest of the rule.
  if (!rule || rule.scope === "org") {
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.isActive, true));
    const ids = rows.map((r) => r.id);
    return { employeeIds: ids, count: ids.length };
  }

  // Custom → union of the provided target sets, active-only.
  const ids = new Set<string>();

  const departmentIds = clean(rule.departmentIds);
  const designationIds = clean(rule.designationIds);
  const workerTypes = clean(rule.workerTypes);
  const roles = clean(rule.roles);
  const employeeIds = clean(rule.employeeIds);
  const managerId = (rule.managerId ?? "").trim();

  // Conditions evaluated directly against the employees row (OR'd together).
  const orConds: SQL[] = [];
  if (departmentIds.length) orConds.push(inArray(employees.departmentId, departmentIds));
  if (designationIds.length) orConds.push(inArray(employees.designationId, designationIds));
  if (workerTypes.length) orConds.push(inArray(employees.workerType, workerTypes as WorkerType[]));
  if (roles.length) orConds.push(inArray(employees.role, roles as EmployeeRole[]));
  if (managerId) orConds.push(eq(employees.managerId, managerId));
  if (employeeIds.length) orConds.push(inArray(employees.id, employeeIds));

  if (orConds.length > 0) {
    const combined = orConds.length === 1 ? orConds[0]! : or(...orConds)!;
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.isActive, true), combined));
    for (const r of rows) ids.add(r.id);
  }

  // Department membership via the many-to-many join table (an employee can
  // belong to a department there without it being their primary department_id).
  if (departmentIds.length) {
    const rows = await db
      .select({ id: employeeDepartments.employeeId })
      .from(employeeDepartments)
      .innerJoin(employees, eq(employees.id, employeeDepartments.employeeId))
      .where(
        and(
          eq(employees.isActive, true),
          inArray(employeeDepartments.departmentId, departmentIds),
        ),
      );
    for (const r of rows) ids.add(r.id);
  }

  const out = [...ids];
  return { employeeIds: out, count: out.length };
}
