import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { getHierarchy } from "@/lib/queries/hierarchy";
import { ReportingHierarchy } from "@/components/admin/reporting-hierarchy";

export const dynamic = "force-dynamic";

/** Operations reads the canonical Admin hierarchy; it has no separate dataset. */
export default async function TeamReportingPage() {
  await requireWorkspaceAdmin("operations");
  const snapshot = await getHierarchy();
  return <ReportingHierarchy people={snapshot.people} inactivePeople={snapshot.inactivePeople} canEdit={false} title="Team Reporting" />;
}
