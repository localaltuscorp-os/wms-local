import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import type { Employee } from "@/db/schema";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

/**
 * Access model for the Accounts module: SUPER-ADMINS or members of the
 * "Accounts" department (the accounts team — assigned in the Admin panel). They
 * get the full module (CC Master, Vasa, checklists, trackers, …). The CA
 * Handover credential vault stays SUPER-ADMIN-ONLY via `canViewCaHandover`.
 * Everyone else is bounced to the hub.
 */
export interface AccountsAccess {
  me: Employee;
  isAdmin: boolean;
  canViewCaHandover: boolean;
}

export async function accountsAccess(): Promise<AccountsAccess | null> {
  const me = await requireUser();
  // Dummy mode exists only outside production and is specifically used for
  // hands-on local verification. Let it exercise every Accounts page and
  // action through this one shared gate, instead of bypassing only the index.
  if (DUMMY_MODE) {
    return { me, isAdmin: true, canViewCaHandover: true };
  }
  const superAdmin = isSuperAdmin(me.email);
  if (!superAdmin) {
    const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
    const departments = me.department ? [...structured, me.department] : structured;
    if (!matchesDepartment(departments, ACCOUNTS_DEPARTMENT)) return null;
  }
  // CA Handover contains a credential vault. It remains super-admin-only even
  // though the rest of the Accounts module is available to the Accounts team.
  return { me, isAdmin: superAdmin, canViewCaHandover: superAdmin };
}

/** For pages: returns access or redirects to /hub if not allowed. */
export async function requireAccountsAccess(): Promise<AccountsAccess> {
  const access = await accountsAccess();
  if (!access) redirect("/hub");
  return access;
}
