import { requireUser, forbiddenError } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getHierarchy } from "@/lib/queries/hierarchy";
import { ReportingHierarchy } from "@/components/admin/reporting-hierarchy";

export const dynamic = "force-dynamic";

export default async function HierarchyPage() {
  const me = await requireUser();
  if (!me.isAdmin && (me.accountType !== "employee" || !me.isActive || me.employmentStatus !== "active")) throw forbiddenError();
  const snapshot = await getHierarchy({ includeInactive: me.isAdmin });
  return <ReportingHierarchy people={snapshot.people} inactivePeople={snapshot.inactivePeople} canEdit={isSuperAdmin(me.email)} />;
}
