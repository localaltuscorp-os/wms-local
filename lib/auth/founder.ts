import "server-only";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { securityRoleGrants } from "@/db/schema";
import { db } from "@/lib/db";

/** Database-backed Founder authority. No name or email grants this role. */
export const isFounder = cache(async (employeeId: string | null | undefined): Promise<boolean> => {
  if (!employeeId) return false;
  try {
    const [row] = await db
      .select({ id: securityRoleGrants.id })
      .from(securityRoleGrants)
      .where(and(eq(securityRoleGrants.employeeId, employeeId), eq(securityRoleGrants.role, "founder")))
      .limit(1);
    return Boolean(row);
  } catch (error) {
    console.error("[founder] grant lookup failed", error);
    return false;
  }
});

export const founderEmployeeIds = cache(async (): Promise<Set<string>> => {
  try {
    const rows = await db
      .select({ employeeId: securityRoleGrants.employeeId })
      .from(securityRoleGrants)
      .where(eq(securityRoleGrants.role, "founder"));
    return new Set(rows.map((row) => row.employeeId));
  } catch (error) {
    console.error("[founder] grant roster lookup failed", error);
    return new Set();
  }
});
