import type { TaskStatus } from "@/db/enums";
import { taskDoerShown } from "@/lib/status/approver-status";

export type TaskKpiKey =
  | "total" | "notRead" | "notStarted" | "initiated" | "followUp" | "needInfo"
  | "done" | "pending" | "approved" | "notApproved" | "onHold" | "cancelled"
  | "archived" | "abandoned";

type StatusCountRow = {
  status: TaskStatus;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | "on_hold" | "archived" | null;
};

/** Counts both status axes from an already-filtered task collection. */
export function computeTaskStatusKpiCounts(rows: readonly StatusCountRow[]): Record<TaskKpiKey, number> {
  return {
    total: rows.length,
    notStarted: rows.filter((row) => taskDoerShown(row.status) === "not_started").length,
    initiated: rows.filter((row) => taskDoerShown(row.status) === "initiated").length,
    followUp: rows.filter((row) => taskDoerShown(row.status) === "follow_up").length,
    needInfo: rows.filter((row) => taskDoerShown(row.status) === "need_info").length,
    abandoned: rows.filter((row) => taskDoerShown(row.status) === "abandoned").length,
    done: rows.filter((row) => taskDoerShown(row.status) === "done").length,
    notRead: rows.filter((row) => taskDoerShown(row.status) === "dont_know").length,
    pending: rows.filter((row) => row.approvalStatus == null).length,
    approved: rows.filter((row) => row.approvalStatus === "approved").length,
    notApproved: rows.filter((row) => row.approvalStatus === "not_approved").length,
    onHold: rows.filter((row) => row.approvalStatus === "on_hold").length,
    cancelled: rows.filter((row) => row.approvalStatus === "cancelled").length,
    archived: rows.filter((row) => row.approvalStatus === "archived").length,
  };
}
