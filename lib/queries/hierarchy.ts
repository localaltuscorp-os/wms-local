import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeTemporaryBreaks, employees, functions } from "@/db/schema";
import { loadSortOrders } from "@/lib/employees/sort-order";
import { loadManagerFlags } from "@/lib/employees/is-manager";
import { isFounderEmail } from "@/lib/auth/founder";

export type HierarchyStatus = "active" | "break" | "inactive";
export type HierarchyRole = "Founder" | "Manager" | "Employee";

/** Minimal roster fields needed by both Reporting Hierarchy views. */
export interface HierarchyPerson {
  id: string;
  name: string;
  functionName: string | null;
  managerId: string | null;
  role: HierarchyRole;
  status: HierarchyStatus;
  isManager: boolean;
  isRoot: boolean;
  sortOrder: number | null;
}

export interface HierarchySnapshot {
  /** Active employees, including people currently on a break. */
  people: HierarchyPerson[];
  /** Populated only for Admin viewers. */
  inactivePeople: HierarchyPerson[];
}

/** Canonical manager_id roster, with break relationships restored for display. */
export async function getHierarchy(opts: { includeInactive?: boolean } = {}): Promise<HierarchySnapshot> {
  const rows = await db.select({
    id: employees.id,
    name: employees.name,
    email: employees.email,
    functionName: functions.name,
    managerId: employees.managerId,
    accountType: employees.accountType,
    isActive: employees.isActive,
    employmentStatus: employees.employmentStatus,
  }).from(employees).leftJoin(functions, eq(functions.id, employees.departmentId)).orderBy(asc(employees.name));

  const staff = rows.filter((row) => row.accountType === "employee");
  const eligible = staff.filter((row) => row.isActive && (!row.employmentStatus || row.employmentStatus === "active"));
  const activeBreakRows = eligible.length
    ? await db.select({ employeeId: employeeTemporaryBreaks.employeeId, previousManagerId: employeeTemporaryBreaks.previousManagerId })
      .from(employeeTemporaryBreaks)
      .where(and(isNull(employeeTemporaryBreaks.endedAt), inArray(employeeTemporaryBreaks.employeeId, eligible.map((row) => row.id))))
    : [];
  const breaks = new Map(activeBreakRows.map((row) => [row.employeeId, row.previousManagerId]));
  const [sortOrders, managerFlags] = await Promise.all([loadSortOrders(), loadManagerFlags()]);

  const toPerson = (row: (typeof staff)[number], status: HierarchyStatus): HierarchyPerson => {
    const isRoot = isFounderEmail(row.email);
    const isManager = managerFlags.get(row.id) ?? false;
    return {
      id: row.id,
      name: row.name,
      functionName: row.functionName,
      managerId: isRoot ? null : status === "break" ? (breaks.get(row.id) ?? row.managerId) : row.managerId,
      role: isRoot ? "Founder" : isManager ? "Manager" : "Employee",
      status,
      isManager,
      isRoot,
      sortOrder: sortOrders.get(row.id) ?? null,
    };
  };

  const people = eligible.map((row) => toPerson(row, breaks.has(row.id) ? "break" : "active"));
  const inactivePeople = opts.includeInactive
    ? staff.filter((row) => !eligible.some((person) => person.id === row.id)).map((row) => toPerson(row, "inactive"))
    : [];

  return { people, inactivePeople };
}
