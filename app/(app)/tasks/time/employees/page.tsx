import { requireUser } from "@/lib/auth/current";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import { employeeTimeReport } from "@/lib/queries/time-reports";
import {
  TimeReportFrame,
  TimeIntelDisabledScreen,
} from "@/components/tasks/time/reports/report-frame";
import { EmployeeReportTable } from "@/components/tasks/time/reports/employee-report-table";

export const dynamic = "force-dynamic";

export default async function EmployeeTimeReportPage() {
  await requireUser();
  if (!timeIntelEnabled()) return <TimeIntelDisabledScreen />;

  const rows = await employeeTimeReport();

  return (
    <TimeReportFrame
      title="Employee Report"
      subtitle="Tracked effort per person — total active time, per-task and per-goal averages, revision time, and approval / rejection rates."
    >
      <EmployeeReportTable rows={rows} />
    </TimeReportFrame>
  );
}
