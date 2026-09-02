import { Users } from "lucide-react";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import type { EmployeeTimeRow } from "@/lib/queries/time-reports";
import { TableShell, EmptyState } from "./report-ui";
import { pct } from "./format";

const TH =
  "px-4 py-3 text-left uppercase font-bold text-ink-subtle whitespace-nowrap";
const TH_NUM = TH + " text-right";
const TD = "px-4 py-3 align-middle text-ink-strong";
const TD_NUM = TD + " text-right tabular-nums";

export function EmployeeReportTable({ rows }: { rows: EmployeeTimeRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Users}
        title="No employee time yet"
        hint="Nobody has logged tracked work time for the current filters."
      />
    );
  }

  return (
    <TableShell>
      <table className="w-full border-collapse" style={{ fontSize: 13.5 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-hairline)", fontSize: 10.5 }}>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Employee</th>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Department</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Tasks</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Done</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Total Time</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Avg / Task</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Avg / Goal</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Avg Revision</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Approval</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Rejection</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.employeeId}
              style={{ borderBottom: "1px solid var(--color-hairline)" }}
              className="hover:bg-surface-soft transition-colors"
            >
              <td className={TD + " font-bold"}>{r.name}</td>
              <td className={TD + " text-ink-muted font-semibold"}>{r.department ?? "—"}</td>
              <td className={TD_NUM + " font-semibold"}>{r.taskCount}</td>
              <td className={TD_NUM + " font-semibold"}>{r.tasksCompleted}</td>
              <td className={TD_NUM + " font-bold"}>{formatMinutesLabel(r.totalActiveSeconds)}</td>
              <td className={TD_NUM}>{formatMinutesLabel(r.avgPerTaskSeconds)}</td>
              <td className={TD_NUM}>
                {r.avgPerGoalSeconds > 0 ? formatMinutesLabel(r.avgPerGoalSeconds) : "—"}
              </td>
              <td className={TD_NUM}>
                {r.avgRevisionSeconds > 0 ? formatMinutesLabel(r.avgRevisionSeconds) : "—"}
              </td>
              <td className={TD_NUM + " font-bold"} style={{ color: "var(--color-emerald-600, #059669)" }}>
                {pct(r.approvalRate)}
              </td>
              <td
                className={TD_NUM + " font-bold"}
                style={{ color: r.rejectionRate > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-muted)" }}
              >
                {pct(r.rejectionRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
