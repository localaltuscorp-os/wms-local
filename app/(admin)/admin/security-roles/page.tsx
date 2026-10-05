import { asc, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { forbiddenError, getSignedInEmployee, requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { hasDatabaseSuperAdminGrant } from "@/lib/security/super-admin-grants";
import { listSecurityRoleAssignments } from "@/lib/auth/security-roles";
import { SECURITY_ROLE_LIST } from "@/lib/auth/security-roles-catalog";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { SecurityRolesPanel } from "@/components/admin/security-roles-panel";

export const dynamic = "force-dynamic";

export default async function SecurityRolesPage() {
  await requireUser();
  const actor = await getSignedInEmployee();
  if (!actor || !(await hasDatabaseSuperAdminGrant(actor.id))) throw forbiddenError();
  const [people, assignments] = await Promise.all([
    db.select({ id: employees.id, name: employees.name, email: employees.email }).from(employees)
      .where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
    listSecurityRoleAssignments(),
  ]);
  return <AdminSection title="Hidden role access" subtitle="Super Admin-only assignments for sensitive operational access." icon={ShieldCheck} stats={[{ label: "Roles", value: SECURITY_ROLE_LIST.length }, { label: "Assignments", value: assignments.length }]}>
    <SecurityRolesPanel people={people.filter((person) => person.email).map((person) => ({ id: person.id, name: person.name, email: person.email }))} assignments={assignments} />
  </AdminSection>;
}
