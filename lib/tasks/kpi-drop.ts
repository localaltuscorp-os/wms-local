import type { TaskStatus } from "@/db/enums";

/**
 * The doer KPI cards that represent a real task status.  These are deliberately
 * kept separate from filter-only cards such as Total and every initiator verdict.
 */
export const DOER_KPI_DROP_STATUS = {
  notRead: "dont_know",
  notStarted: "not_started",
  initiated: "initiated",
  followUp: "follow_up",
  needInfo: "need_info",
  done: "done",
  abandoned: "abandoned",
} as const satisfies Record<string, TaskStatus>;

export function doerKpiDropStatus(key: string): TaskStatus | null {
  return DOER_KPI_DROP_STATUS[key as keyof typeof DOER_KPI_DROP_STATUS] ?? null;
}
