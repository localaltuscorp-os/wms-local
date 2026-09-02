import type { Task } from "@/db/schema";
import type { KpiTotals, StatusDistribution } from "@/lib/types";
import { TASK_STATUSES, type TaskStatus } from "@/db/enums";

export function computeKpiTotals(tasks: Task[]): KpiTotals {
  let pending = 0;
  let notStarted = 0;
  let needHelp = 0;
  let done = 0;
  let notApproved = 0;

  for (const t of tasks) {
    // Done bucket: legacy `done`/`approved` lifecycle values OR new
    // approval_status="approved" verdict (any status).
    if (
      t.status === "done" ||
      t.status === "approved" ||
      t.approvalStatus === "approved"
    ) {
      done++;
      continue;
    }
    // Not-approved bucket: legacy status value OR new approval_status.
    if (t.status === "not_approved" || t.approvalStatus === "not_approved") {
      notApproved++;
      continue;
    }
    if (t.status === "not_started") notStarted++;
    else if (t.status === "need_info") needHelp++; // need_help retired → need_info
    else if (
      t.status === "initiated" ||
      t.status === "follow_up" ||
      t.status === "follow_up_1" ||
      t.status === "follow_up_2" ||
      t.status === "follow_up_3"
    ) {
      pending++;
    }
  }

  return {
    total: tasks.length,
    pending,
    notStarted,
    needHelp,
    done,
    notApproved,
  };
}

export function computeStatusDistribution(
  tasks: Task[],
): StatusDistribution[] {
  const counts = new Map<TaskStatus, number>(
    TASK_STATUSES.map((s) => [s, 0]),
  );

  for (const t of tasks) {
    counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  }

  return TASK_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  })).filter((d) => d.count > 0);
}
