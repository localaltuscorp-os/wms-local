"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DOER_TASK_KPI_SPECS,
  INITIATOR_TASK_KPI_SPECS,
  TaskStatusKpiChip,
  type TaskKpiKey,
  type TaskKpiView,
} from "@/components/tasks/task-status-kpi-strip";
import { setPlanNodeStatus } from "@/app/(app)/project-plan/actions";
import { fireToast } from "@/lib/toast";

export const PROJECT_STATUS_FOR_KPI: Partial<Record<TaskKpiKey, string>> = {
  notRead: "dont_know",
  notStarted: "not_started",
  initiated: "initiated",
  followUp: "follow_up",
  needInfo: "need_info",
  done: "done",
  abandoned: "abandoned",
  pending: "pending",
  approved: "approved",
  notApproved: "not_approved",
  onHold: "on_hold",
  cancelled: "cancelled",
  archived: "archived",
};

export function PlanStatusKpiStrip({
  counts,
  total,
  view = "doer",
  activeKey,
  onKpiChange,
}: {
  counts: Record<string, number>;
  total: number;
  view?: TaskKpiView;
  activeKey: TaskKpiKey | null;
  onKpiChange: (key: TaskKpiKey) => void;
}) {
  const specs = view === "initiator" ? INITIATOR_TASK_KPI_SPECS : DOER_TASK_KPI_SPECS;
  const router = useRouter();
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const moveDroppedNode = async (event: React.DragEvent<HTMLButtonElement>, status: string, label: string) => {
    event.preventDefault();
    if (savingKey) return;
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/x-altus-project-node")) as { id?: unknown };
      if (typeof payload.id !== "string") return;
      setSavingKey(status);
      const result = await setPlanNodeStatus({ id: payload.id, status });
      if (!result.ok) {
        fireToast({ message: result.error ?? "You can't move this project to that status.", type: "error" });
        return;
      }
      fireToast({ message: `Project moved to ${label}` });
      router.refresh();
    } catch {
      fireToast({ message: "Couldn't move this project. Please try again.", type: "error" });
    } finally {
      setSavingKey(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${view === "initiator" ? "Initiator" : "Doer"} project status summary`}>
      {specs.map((spec) => {
        const status = PROJECT_STATUS_FOR_KPI[spec.key];
        const value = spec.key === "total" ? total : counts[status ?? ""] ?? 0;
        const acceptsDrop = view === "doer" && Boolean(status);
        return (
          <button
            key={spec.key}
            type="button"
            onClick={() => onKpiChange(spec.key)}
            onDragOver={(event) => { if (acceptsDrop && !savingKey) event.preventDefault(); }}
            onDrop={(event) => { if (acceptsDrop && status) void moveDroppedNode(event, status, spec.label); }}
            aria-pressed={spec.key === activeKey}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-altus-red/50"
          >
            <TaskStatusKpiChip spec={spec} value={value} active={spec.key === activeKey} />
          </button>
        );
      })}
    </div>
  );
}
