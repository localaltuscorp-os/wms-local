import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  departments,
  employeeDepartments,
  employees,
  type Department,
} from "@/db/schema";

/**
 * Every department, ordered by sort_order then name. Includes inactive
 * rows because the admin page needs to render them; pickers should
 * filter on `.isActive` themselves.
 */
export async function listDepartments(): Promise<Department[]> {
  return db
    .select()
    .from(departments)
    .orderBy(asc(departments.sortOrder), asc(departments.name));
}

/**
 * Departments + employee count. Used by /admin/departments to show
 * "N employees" alongside each row.
 */
export interface DepartmentWithCount extends Department {
  employeeCount: number;
}

export async function listDepartmentsWithCounts(): Promise<DepartmentWithCount[]> {
  // Count distinct MEMBERS via the join table (a person can be in several
  // departments), not just the primary-department FK.
  const rows = await db
    .select({
      id: departments.id,
      name: departments.name,
      isActive: departments.isActive,
      sortOrder: departments.sortOrder,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
      employeeCount: sql<number>`count(${employeeDepartments.employeeId})::int`,
    })
    .from(departments)
    .leftJoin(
      employeeDepartments,
      eq(employeeDepartments.departmentId, departments.id),
    )
    .groupBy(departments.id)
    .orderBy(asc(departments.sortOrder), asc(departments.name));
  return rows;
}

/** A single department a person belongs to, as surfaced to the UI. */
export interface EmployeeDepartmentRef {
  id: string;
  name: string;
  isPrimary: boolean;
}

/**
 * Membership map: employeeId → the departments they belong to, primary
 * first then alphabetical.  Feeds the employee admin (chips + edit dialog)
 * and the dashboard status table's per-department grouping.
 */
export async function getEmployeeDepartmentMap(): Promise<
  Map<string, EmployeeDepartmentRef[]>
> {
  const rows = await db
    .select({
      employeeId: employeeDepartments.employeeId,
      id: departments.id,
      name: departments.name,
      isPrimary: employeeDepartments.isPrimary,
    })
    .from(employeeDepartments)
    .innerJoin(departments, eq(departments.id, employeeDepartments.departmentId))
    .orderBy(desc(employeeDepartments.isPrimary), asc(departments.name));

  const map = new Map<string, EmployeeDepartmentRef[]>();
  for (const r of rows) {
    const list = map.get(r.employeeId) ?? [];
    list.push({ id: r.id, name: r.name, isPrimary: r.isPrimary });
    map.set(r.employeeId, list);
  }
  return map;
}

/**
 * Distinct employee IDs who belong to ANY of the given department names
 * (case-insensitive via the canonical `departments.name`).  Used by the
 * task + dashboard department filters so membership — not just the primary
 * department — drives which tasks match.  Returns [] for an empty input.
 */
export async function employeeIdsInDepartments(
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = await db
    .selectDistinct({ employeeId: employeeDepartments.employeeId })
    .from(employeeDepartments)
    .innerJoin(departments, eq(departments.id, employeeDepartments.departmentId))
    .where(inArray(departments.name, names));
  return rows.map((r) => r.employeeId);
}

/**
 * All structured department NAMES an employee belongs to (full membership, not
 * just the primary). This is the source of truth for workspace access on
 * department-gated rooms (e.g. Sales) — the legacy free-text `employees.
 * department` column only holds one value and misses multi-department people.
 */
export async function employeeDepartmentNames(employeeId: string): Promise<string[]> {
  const rows = await db
    .select({ name: departments.name })
    .from(employeeDepartments)
    .innerJoin(departments, eq(departments.id, employeeDepartments.departmentId))
    .where(eq(employeeDepartments.employeeId, employeeId));
  return rows.map((r) => r.name);
}

/**
 * Just active departments, used by employee pickers (invite + edit).
 */
export async function listActiveDepartments(): Promise<Department[]> {
  return db
    .select()
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.sortOrder), asc(departments.name));
}
