import { requireUser } from "@/lib/auth/current";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import {
  managerTimeReport,
  timeReportFilterOptions,
  type TimeReportFilters,
} from "@/lib/queries/time-reports";
import { TASK_PRIORITIES, type TaskPriority } from "@/db/enums";
import {
  TimeReportFrame,
  TimeIntelDisabledScreen,
} from "@/components/tasks/time/reports/report-frame";
import { ManagerReport } from "@/components/tasks/time/reports/manager-report";
import { ManagerFilterBar } from "@/components/tasks/time/reports/manager-filter-bar";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: string | string[] | undefined): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

const PRIORITY_SET = new Set<string>(TASK_PRIORITIES);

/** Parse the URL query into a validated TimeReportFilters. */
function parseFilters(sp: Record<string, string | string[] | undefined>): TimeReportFilters {
  const priority = str(sp.priority);
  const f: TimeReportFilters = {
    employeeId: str(sp.employee),
    department: str(sp.department),
    client: str(sp.client),
    subject: str(sp.subject),
    priority: priority && PRIORITY_SET.has(priority) ? (priority as TaskPriority) : undefined,
    goalId: str(sp.goal),
    from: str(sp.from),
    to: str(sp.to),
  };
  return f;
}

export default async function ManagerTimeReportPage({ searchParams }: PageProps) {
  await requireUser();
  if (!timeIntelEnabled()) return <TimeIntelDisabledScreen />;

  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [options, report] = await Promise.all([
    timeReportFilterOptions(),
    managerTimeReport(filters),
  ]);

  return (
    <TimeReportFrame
      title="Manager Report"
      subtitle="Slice tracked time by employee, department, client, subject, priority, date range, goal or task — then see the biggest time sinks."
    >
      <ManagerFilterBar options={options} initial={filters} />
      <ManagerReport report={report} />
    </TimeReportFrame>
  );
}
