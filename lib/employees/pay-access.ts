import "server-only";
import { hasCapabilityGrant } from "@/lib/security/capability-grants";
import type { Employee } from "@/db/schema";

/**
 * MAY THIS PERSON VIEW OR EDIT EMPLOYEE PAY?
 *
 * Used by the Employee Master (page, detail loader, CTC and payroll saves) and
 * by `inviteEmployee` when a salary is supplied. Being an admin — or a
 * super-admin — is NOT enough: the capability is a database grant
 * (`employee_pay.manage`, migration 0271) and nobody holds it by code.
 *
 * It fails closed. `hasCapabilityGrant` returns false for a missing address, and
 * a failed read of the grant table leaves only the code baseline, which is empty
 * for this capability.
 */
export async function canManageEmployeePay(
  me: Pick<Employee, "email">,
): Promise<boolean> {
  return hasCapabilityGrant(me.email, "employee_pay.manage");
}

/** The refusal returned when pay is touched without the capability. Names no one. */
export const EMPLOYEE_PAY_REFUSAL =
  "You do not have permission to view or change salary. Ask a super-admin to grant “Manage pay” on your employee record.";
