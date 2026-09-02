import { Target } from "lucide-react";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import type { GoalTimeRow } from "@/lib/queries/time-reports";
import { TableShell, EmptyState } from "./report-ui";

const TH = "px-4 py-3 text-left uppercase font-bold text-ink-subtle whitespace-nowrap";
const TH_NUM = TH + " text-right";
const TD = "px-4 py-3 align-middle text-ink-strong";
const TD_NUM = TD + " text-right tabular-nums";

export function GoalReportTable({ rows }: { rows: GoalTimeRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Target}
        title="No goal time yet"
        hint="Time rolls up here once tracked tasks are linked to a weekly goal."
      />
    );
  }

  return (
    <TableShell>
      <table className="w-full border-collapse" style={{ fontSize: 13.5 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-hairline)", fontSize: 10.5 }}>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Weekly Goal</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Tasks</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Total Time</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Avg / Task</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.goalId}
              style={{ borderBottom: "1px solid var(--color-hairline)" }}
              className="hover:bg-surface-soft transition-colors"
            >
              <td className={TD + " font-bold"}>
                <span className="block max-w-[480px] truncate" title={r.goalTitle}>
                  {r.goalTitle}
                </span>
              </td>
              <td className={TD_NUM + " font-semibold"}>{r.taskCount}</td>
              <td className={TD_NUM + " font-bold"}>{formatMinutesLabel(r.totalActiveSeconds)}</td>
              <td className={TD_NUM}>{formatMinutesLabel(r.avgPerTaskSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
