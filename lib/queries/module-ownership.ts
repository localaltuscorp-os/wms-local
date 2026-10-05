import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, moduleOwnershipAssignments, moduleOwnershipPolicies } from "@/db/schema";

export async function listOwnershipPeople() {
  return db
    .select({ id: employees.id, name: employees.name, department: employees.department })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}

export async function listOwnershipAssignments() {
  return db
    .select({
      nodeKey: moduleOwnershipAssignments.nodeKey,
      role: moduleOwnershipAssignments.role,
      employeeId: moduleOwnershipAssignments.employeeId,
      canView: moduleOwnershipAssignments.canView,
      canEdit: moduleOwnershipAssignments.canEdit,
    })
    .from(moduleOwnershipAssignments)
    .orderBy(asc(moduleOwnershipAssignments.nodeKey), asc(moduleOwnershipAssignments.role));
}

export async function listOwnershipPolicies() {
  return db
    .select({
      nodeKey: moduleOwnershipPolicies.nodeKey,
      defaultVisibility: moduleOwnershipPolicies.defaultVisibility,
    })
    .from(moduleOwnershipPolicies)
    .orderBy(asc(moduleOwnershipPolicies.nodeKey));
}
