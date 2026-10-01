import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getHierarchy } from "@/lib/queries/hierarchy";
import { ReportingHierarchy } from "@/components/admin/reporting-hierarchy";

export const dynamic = "force-dynamic";

/** Operations reads the canonical Admin hierarchy; it has no separate dataset. */
export default async function TeamReportingPage() {
  const me = await requireWorkspaceAdmin("operations");
  const snapshot = await getHierarchy();
  return <ReportingHierarchy people={snapshot.people} canEdit={isSuperAdmin(me.email)} title="Team Reporting" />;
}
