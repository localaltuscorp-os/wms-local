import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { departments, designations, employeeTemporaryBreaks, employees } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { recordManagerChange } from "@/lib/employees/manager-history";

export interface TemporaryBreakRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  functionName: string | null;
  designationName: string | null;
  breakFrom: string;
  expectedReturn: string | null;
  reason: string | null;
}

export async function activeTemporaryBreakEmployeeIds(): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ employeeId: employeeTemporaryBreaks.employeeId })
      .from(employeeTemporaryBreaks)
      .where(isNull(employeeTemporaryBreaks.endedAt));
    return new Set(rows.map((row) => row.employeeId));
  } catch (error) {
    // Compatibility during deploy before migration 0258 reaches this database.
    console.error("[temporary-break] active-break lookup failed", error);
    return new Set();
  }
}

export async function isEmployeeOnTemporaryBreak(employeeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: employeeTemporaryBreaks.id })
    .from(employeeTemporaryBreaks)
    .where(and(eq(employeeTemporaryBreaks.employeeId, employeeId), isNull(employeeTemporaryBreaks.endedAt)))
    .limit(1);
  return Boolean(row);
}

export async function listActiveTemporaryBreaks(): Promise<TemporaryBreakRow[]> {
  return await db
    .select({
      id: employeeTemporaryBreaks.id,
      employeeId: employees.id,
      employeeName: employees.name,
      employeeCode: employees.employeeCode,
      functionName: departments.name,
      designationName: designations.name,
      breakFrom: employeeTemporaryBreaks.breakFrom,
      expectedReturn: employeeTemporaryBreaks.expectedReturn,
      reason: employeeTemporaryBreaks.reason,
    })
    .from(employeeTemporaryBreaks)
    .innerJoin(employees, eq(employees.id, employeeTemporaryBreaks.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(isNull(employeeTemporaryBreaks.endedAt))
    .orderBy(asc(employeeTemporaryBreaks.breakFrom), asc(employees.name));
}

export async function startTemporaryBreak(input: {
  employeeId: string;
  breakFrom: string;
  expectedReturn: string | null;
  reason: string | null;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.expectedReturn && input.expectedReturn < input.breakFrom) {
    return { ok: false, error: "Expected Return cannot be before Break From." };
  }

  let previousManagerId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [employee] = await tx
        .select({
          id: employees.id,
          email: employees.email,
          managerId: employees.managerId,
          isActive: employees.isActive,
          employmentStatus: employees.employmentStatus,
          accountType: employees.accountType,
        })
        .from(employees)
        .where(eq(employees.id, input.employeeId))
        .limit(1);
      if (!employee || employee.accountType !== "employee") throw new Error("Employee not found.");
      if (isSuperAdmin(employee.email)) throw new Error("A hierarchy root cannot be put on Temporary Break.");
      if (!employee.isActive || employee.employmentStatus !== "active") {
        throw new Error("Only active employees can be put on Temporary Break.");
      }

      previousManagerId = employee.managerId;
      await tx.insert(employeeTemporaryBreaks).values({
        employeeId: employee.id,
        breakFrom: input.breakFrom,
        expectedReturn: input.expectedReturn,
        reason: input.reason,
        previousManagerId,
        startedById: input.actorId,
      });
      await tx.update(employees).set({ managerId: null }).where(eq(employees.id, employee.id));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Temporary Break.";
    if (message.includes("employee_temporary_breaks_one_active_uidx")) {
      return { ok: false, error: "Employee is already on Temporary Break." };
    }
    return { ok: false, error: message };
  }

  try {
    await recordManagerChange({
      employeeId: input.employeeId,
      managerId: null,
      changedById: input.actorId,
      note: "Temporary Break started",
    });
  } catch (error) {
    console.error("[temporary-break] manager history start write failed", error);
  }
  return { ok: true };
}

export async function endTemporaryBreak(input: {
  breakId: string;
  actorId: string;
}): Promise<{ ok: true; restoredManager: boolean } | { ok: false; error: string }> {
  let employeeId: string | null = null;
  let restoreManagerId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [activeBreak] = await tx
        .select({
          id: employeeTemporaryBreaks.id,
          employeeId: employeeTemporaryBreaks.employeeId,
          previousManagerId: employeeTemporaryBreaks.previousManagerId,
        })
        .from(employeeTemporaryBreaks)
        .where(and(eq(employeeTemporaryBreaks.id, input.breakId), isNull(employeeTemporaryBreaks.endedAt)))
        .limit(1);
      if (!activeBreak) throw new Error("Temporary Break not found.");

      employeeId = activeBreak.employeeId;
      if (activeBreak.previousManagerId) {
        const [manager] = await tx
          .select({
            id: employees.id,
            isActive: employees.isActive,
            employmentStatus: employees.employmentStatus,
          })
          .from(employees)
          .where(eq(employees.id, activeBreak.previousManagerId))
          .limit(1);
        if (manager?.isActive && manager.employmentStatus === "active") {
          const [managerBreak] = await tx
            .select({ id: employeeTemporaryBreaks.id })
            .from(employeeTemporaryBreaks)
            .where(and(eq(employeeTemporaryBreaks.employeeId, manager.id), isNull(employeeTemporaryBreaks.endedAt)))
            .limit(1);
          if (!managerBreak) restoreManagerId = manager.id;
        }
      }

      await tx
        .update(employeeTemporaryBreaks)
        .set({ endedAt: new Date(), endedById: input.actorId, updatedAt: new Date() })
        .where(eq(employeeTemporaryBreaks.id, activeBreak.id));
      await tx
        .update(employees)
        .set({ managerId: restoreManagerId })
        .where(eq(employees.id, activeBreak.employeeId));
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not end Temporary Break." };
  }

  if (!employeeId) return { ok: false, error: "Temporary Break not found." };
  try {
    await recordManagerChange({
      employeeId,
      managerId: restoreManagerId,
      changedById: input.actorId,
      note: "Temporary Break ended",
    });
  } catch (error) {
    console.error("[temporary-break] manager history end write failed", error);
  }
  return { ok: true, restoredManager: restoreManagerId !== null };
}
