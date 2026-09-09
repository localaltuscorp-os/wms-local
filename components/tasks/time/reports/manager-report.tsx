import { Clock, Gauge, CheckCircle2, XCircle, RotateCcw, Flame } from "lucide-react";
import { CardGrid } from "@/components/layout/card-grid";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import type { ManagerTimeReport } from "@/lib/queries/time-reports";
import { StatCard } from "./report-ui";
import { TaskReportTable } from "./task-report-table";

/** Manager report body — filtered totals + the top time-consuming tasks. */
export function ManagerReport({ report }: { report: ManagerTimeReport }) {
  return (
    <div className="flex flex-col gap-6">
      <CardGrid min={210}>
        <StatCard
          label="Total Time"
          value={formatMinutesLabel(report.totalActiveSeconds)}
          sub={`${report.taskCount.toLocaleString("en-IN")} tracked ${report.taskCount === 1 ? "task" : "tasks"}`}
          Icon={Clock}
          accent
        />
        <StatCard
          label="Avg Time / Task"
          value={report.taskCount > 0 ? formatMinutesLabel(report.avgSeconds) : "—"}
          sub="Active effort per task"
          Icon={Gauge}
        />
        <StatCard
          label="Approved"
          value={report.approvedCount.toLocaleString("en-IN")}
          sub="Tasks signed off"
          Icon={CheckCircle2}
        />
        <StatCard
          label="Rejected"
          value={report.rejectedCount.toLocaleString("en-IN")}
          sub="Tasks sent back at least once"
          Icon={XCircle}
        />
        <StatCard
          label="Revision Time"
          value={formatMinutesLabel(report.revisionSeconds)}
          sub="Time spent on rework"
          Icon={RotateCcw}
        />
      </CardGrid>

      <div>
        <div className="mb-3 flex items-center gap-2 text-ink-subtle">
          <Flame size={16} strokeWidth={2.3} style={{ color: "var(--color-altus-red)" }} aria-hidden />
          <h2
            className="uppercase font-bold"
            style={{ fontSize: 11.5, letterSpacing: "0.1em" }}
          >
            Most Time-Consuming Tasks
          </h2>
        </div>
        <TaskReportTable rows={report.topTasks} searched={false} />
      </div>
    </div>
  );
}
