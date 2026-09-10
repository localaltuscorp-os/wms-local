import "server-only";
import { redirect } from "next/navigation";
import type { Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { isHrIntakeGrantee } from "@/lib/hr/intake-grantees";

/**
 * Server guards for the HR INTAKE GRANT. The allow-list itself, and the reason
 * it exists at all, live in ./intake-grantees.ts - that file is pure so it can
 * be unit-tested and read from a client component; this one needs the DB (the
 * department lookup) and so is server-only.
 */
export { HR_INTAKE_EMAILS, isHrIntakeGrantee } from "@/lib/hr/intake-grantees";

/**
 * May this person fill the onboarding form / candidate evaluation? HR staff keep
 * everything they already had; grantees are added ON TOP, never instead.
 *
 * Fails CLOSED if the department lookup throws, matching `dossierAccess()`: an
 * unavailable DB must not silently widen who can read a colleague's joining data.
 */
export async function canFillHrIntake(me: Employee): Promise<boolean> {
  if (isHrIntakeGrantee(me.email)) return true;
  return isHrStaff(me).catch(() => false);
}

/**
 * Page/action gate for the evaluation surface. Mirrors `requireHrStaff` - the
 * same bounce to the HR landing - but admits the narrow grantees too.
 */
export async function requireHrIntake(): Promise<Employee> {
  const me = await requireUser();
  if (!(await canFillHrIntake(me))) redirect("/hr");
  return me;
}
