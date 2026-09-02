import { requireUser } from "@/lib/auth/current";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import { goalTimeReport } from "@/lib/queries/time-reports";
import {
  TimeReportFrame,
  TimeIntelDisabledScreen,
} from "@/components/tasks/time/reports/report-frame";
import { GoalReportTable } from "@/components/tasks/time/reports/goal-report-table";

export const dynamic = "force-dynamic";

export default async function GoalTimeReportPage() {
  await requireUser();
  if (!timeIntelEnabled()) return <TimeIntelDisabledScreen />;

  const rows = await goalTimeReport();

  return (
    <TimeReportFrame
      title="Goal Report"
      subtitle="Tracked task time rolled up to each weekly goal — how much real effort every goal consumed, and the average per task."
    >
      <GoalReportTable rows={rows} />
    </TimeReportFrame>
  );
}
