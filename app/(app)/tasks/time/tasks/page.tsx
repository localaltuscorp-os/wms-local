import { requireUser } from "@/lib/auth/current";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import { taskTimeReport } from "@/lib/queries/time-reports";
import {
  TimeReportFrame,
  TimeIntelDisabledScreen,
} from "@/components/tasks/time/reports/report-frame";
import { TaskReportTable } from "@/components/tasks/time/reports/task-report-table";
import { TaskSearchBar } from "@/components/tasks/time/reports/task-search-bar";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TaskTimeReportPage({ searchParams }: PageProps) {
  await requireUser();
  if (!timeIntelEnabled()) return <TimeIntelDisabledScreen />;

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await taskTimeReport(q, {});

  return (
    <TimeReportFrame
      title="Task Report"
      subtitle="Search any task to see its full time story — created / started / done / approved, sessions, revisions and total active time."
      actions={<TaskSearchBar initial={q} />}
    >
      <TaskReportTable rows={rows} searched={q.trim().length > 0} />
    </TimeReportFrame>
  );
}
