import Link from "next/link";
import type { Route } from "next";
import { ListTodo } from "lucide-react";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import type { TaskTimeRow } from "@/lib/queries/time-reports";
import { TableShell, EmptyState } from "./report-ui";
import { fmtDate } from "./format";

const TH = "px-4 py-3 text-left uppercase font-bold text-ink-subtle whitespace-nowrap";
const TH_NUM = TH + " text-right";
const TD = "px-4 py-3 align-middle text-ink-strong";
const TD_NUM = TD + " text-right tabular-nums";

export function TaskReportTable({
  rows,
  searched,
}: {
  rows: TaskTimeRow[];
  searched: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={ListTodo}
        title={searched ? "No matching tasks" : "No task time yet"}
        hint={
          searched
            ? "Try a different task title, number, client or subject."
            : "Tasks appear here once work time has been tracked on them."
        }
      />
    );
  }

  return (
    <TableShell>
      <table className="w-full border-collapse" style={{ fontSize: 13.5 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-hairline)", fontSize: 10.5 }}>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Task</th>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Doer</th>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Created</th>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Started</th>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Done</th>
            <th className={TH} style={{ letterSpacing: "0.08em" }}>Approved</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Sessions</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Revisions</th>
            <th className={TH_NUM} style={{ letterSpacing: "0.08em" }}>Total Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.taskId}
              style={{ borderBottom: "1px solid var(--color-hairline)" }}
              className="hover:bg-surface-soft transition-colors"
            >
              <td className={TD}>
                <Link
                  href={`/tasks/${r.taskId}` as Route}
                  className="font-bold text-ink-strong hover:text-[var(--color-altus-red-deep)] transition-colors"
                  title={r.title}
                >
                  <span className="block max-w-[340px] truncate">{r.title}</span>
                </Link>
                <span className="mt-0.5 block text-ink-subtle" style={{ fontSize: 11.5 }}>
                  {r.taskNo != null ? `#${r.taskNo}` : ""}
                  {r.taskNo != null && r.client ? " · " : ""}
                  {r.client ?? ""}
                </span>
              </td>
              <td className={TD + " text-ink-muted font-semibold whitespace-nowrap"}>{r.doerName}</td>
              <td className={TD + " text-ink-muted whitespace-nowrap"}>{fmtDate(r.createdAt)}</td>
              <td className={TD + " text-ink-muted whitespace-nowrap"}>{fmtDate(r.firstStartedAt)}</td>
              <td className={TD + " text-ink-muted whitespace-nowrap"}>{fmtDate(r.lastDoneAt)}</td>
              <td className={TD + " text-ink-muted whitespace-nowrap"}>{fmtDate(r.approvedAt)}</td>
              <td className={TD_NUM + " font-semibold"}>{r.sessionCount}</td>
              <td
                className={TD_NUM + " font-semibold"}
                style={{ color: r.rejectionCount > 0 ? "var(--color-altus-red-deep)" : undefined }}
              >
                {r.rejectionCount}
              </td>
              <td className={TD_NUM + " font-bold"}>{formatMinutesLabel(r.totalActiveSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
