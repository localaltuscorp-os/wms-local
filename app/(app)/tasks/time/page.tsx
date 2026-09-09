import { requireUser } from "@/lib/auth/current";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import { timeDashboardWidgets } from "@/lib/queries/time-reports";
import {
  TimeReportFrame,
  TimeIntelDisabledScreen,
} from "@/components/tasks/time/reports/report-frame";
import { DashboardWidgets } from "@/components/tasks/time/reports/dashboard-widgets";

export const dynamic = "force-dynamic";

export default async function TimeIntelligenceHubPage() {
  await requireUser();
  if (!timeIntelEnabled()) return <TimeIntelDisabledScreen />;

  const widgets = await timeDashboardWidgets();

  return (
    <TimeReportFrame
      title="Time Intelligence"
      subtitle="Real, session-level effort across every task — from first Start Work to final Approval, including every revision cycle."
    >
      <DashboardWidgets w={widgets} />
    </TimeReportFrame>
  );
}
