"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getSignedInEmployee, requireUser } from "@/lib/auth/current";
import { hasDatabaseSuperAdminGrant } from "@/lib/security/super-admin-grants";
import { grantSecurityRole, revokeSecurityRole } from "@/lib/auth/security-roles";
import { isSecurityRole } from "@/lib/auth/security-roles-catalog";
import { rateLimitOrError } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };
const PATH = "/admin/security-roles";

async function authorize(): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  await requireUser();
  const actor = await getSignedInEmployee();
  if (!actor || !(await hasDatabaseSuperAdminGrant(actor.id))) {
    return { ok: false, error: "Only a Super Admin can change hidden roles." };
  }
  const limited = rateLimitOrError(actor.id, "write");
  return limited ? limited : { ok: true, actorId: actor.id };
}

export async function setSecurityRole(input: { employeeId: string; role: string; grant: boolean }): Promise<Result> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const employeeId = String(input.employeeId ?? "").trim();
  const role = String(input.role ?? "").trim();
  if (!employeeId || !isSecurityRole(role) || typeof input.grant !== "boolean") {
    return { ok: false, error: "The selected employee or role is invalid." };
  }
  if (employeeId === auth.actorId) return { ok: false, error: "You cannot change your own hidden roles." };
  const [employee] = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.isActive, true))).limit(1);
  if (!employee) return { ok: false, error: "That employee is not active." };
  try {
    if (input.grant) await grantSecurityRole(employeeId, role, auth.actorId);
    else await revokeSecurityRole(employeeId, role, auth.actorId);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    console.error("[security-roles] write failed", error);
    return { ok: false, error: "The role could not be saved. Try again." };
  }
}
