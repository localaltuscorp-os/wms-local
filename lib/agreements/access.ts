import "server-only";
import { requireAdmin, getCurrentEmployee } from "@/lib/auth/current";
import type { Employee } from "@/db/schema";

/**
 * HR/admin generates + tracks agreements (they carry CTC — sensitive), so the
 * workbench + tracker are admin-only. Employees only ever see/sign their OWN
 * agreement (ownership-checked in the sign flow), never the roster.
 */
export async function requireAgreementsAdmin(): Promise<Employee> {
  return requireAdmin();
}

export { getCurrentEmployee };
