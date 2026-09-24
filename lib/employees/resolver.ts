import "server-only";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";

export interface EmployeeReference {
  id: string;
  employeeCode: string;
  name: string;
}

/** Resolve user-facing Employee ID (employee_code) and/or name to the UUID FK. */
export async function resolveEmployeeReference(input: {
  employeeId?: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  activeOnly?: boolean;
}): Promise<{ ok: true; employee: EmployeeReference } | { ok: false; error: string }> {
  const code = input.employeeCode?.trim().toUpperCase() ?? "";
  const name = input.employeeName?.trim().replace(/\s+/g, " ") ?? "";
  if (!input.employeeId && !code && !name) return { ok: false, error: "Employee ID or Employee Name is required." };

  const filters = [];
  if (code) filters.push(eq(employees.employeeCode, code));
  if (name) filters.push(ilike(employees.name, name));
  if (input.employeeId) filters.push(eq(employees.id, input.employeeId));
  const rows = await db
    .select({ id: employees.id, employeeCode: employees.employeeCode, name: employees.name })
    .from(employees)
    .where(and(input.activeOnly === false ? undefined : eq(employees.isActive, true), or(...filters)));

  const byCode = code ? rows.find((row) => row.employeeCode?.toUpperCase() === code) : undefined;
  const byId = input.employeeId ? rows.find((row) => row.id === input.employeeId) : undefined;
  const byName = name
    ? rows.filter((row) => row.name.trim().replace(/\s+/g, " ").toLocaleLowerCase() === name.toLocaleLowerCase())
    : [];
  const employee = byCode ?? byId ?? (byName.length === 1 ? byName[0] : undefined);
  if (!employee || !employee.employeeCode) {
    return { ok: false, error: code ? "Employee ID is not a current Employee Code." : "Employee Name is not unique in Employee Master." };
  }
  if (employee && name && employee.name.trim().replace(/\s+/g, " ").toLocaleLowerCase() !== name.toLocaleLowerCase()) {
    return { ok: false, error: "Employee ID and Employee Name must refer to the same Employee Master record." };
  }
  if (!code && byName.length > 1) return { ok: false, error: "Employee Name is not unique in Employee Master." };
  return { ok: true, employee: { ...employee, employeeCode: employee.employeeCode } };
}
