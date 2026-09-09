/**
 * Task detail redesign — small pure helpers (client-safe). Powers the Progress
 * card, the Estimated-vs-Actual readout, and the "AI Insights" card (a
 * transparent heuristic labelled "AI Analysis" — no external model call).
 */
import type { TaskStatus } from "@/db/enums";

/** Status → a coarse progress percentage for the Progress card. */
export function progressFromStatus(status: TaskStatus, approvalStatus: string | null): number {
  if (approvalStatus === "approved") return 100;
  switch (status) {
    case "done":
      return 100;
    case "follow_up":
    case "follow_up_1":
    case "follow_up_2":
    case "follow_up_3":
      return 60;
    case "on_hold":
      return 40;
    case "need_info":
    case "need_help":
      return 35;
    case "initiated":
      return 25;
    default:
      return 0; // dont_know / not_started / legacy
  }
}

/** Minutes → "2h 30m" / "45m" / "—". */
export function formatEstimate(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface TaskInsight {
  tone: "good" | "warn" | "bad";
  title: string;
  body: string;
}

/** A transparent heuristic "insight" from the task's real signals. */
export function computeTaskInsight(input: {
  status: TaskStatus;
  approvalStatus: string | null;
  dueAt: Date;
  totalActiveSeconds: number;
  estimatedMinutes: number | null;
  rejectionCount: number;
  now: Date;
}): TaskInsight {
  const { status, approvalStatus, dueAt, totalActiveSeconds, estimatedMinutes, rejectionCount, now } = input;
  const actualMin = Math.round(totalActiveSeconds / 60);
  const isDone = status === "done" || approvalStatus === "approved";
  const overdue = !isDone && now.getTime() > dueAt.getTime();

  if (approvalStatus === "approved") {
    return {
      tone: "good",
      title: "Approved & closed",
      body: `Delivered in ${formatEstimate(actualMin)} of active effort${
        estimatedMinutes ? ` (estimate ${formatEstimate(estimatedMinutes)})` : ""
      }.`,
    };
  }
  if (approvalStatus === "not_approved") {
    return {
      tone: "warn",
      title: "In revision",
      body: `Sent back ${rejectionCount || 1} time${(rejectionCount || 1) > 1 ? "s" : ""} — ${formatEstimate(
        actualMin,
      )} logged so far.`,
    };
  }
  if (overdue) {
    return {
      tone: "bad",
      title: "Overdue",
      body: `Past the due date with ${formatEstimate(actualMin)} logged. Needs attention.`,
    };
  }
  if (status === "done") {
    return { tone: "good", title: "Awaiting approval", body: `Marked done — ${formatEstimate(actualMin)} of effort logged.` };
  }
  if (estimatedMinutes && actualMin > estimatedMinutes * 1.25) {
    return {
      tone: "warn",
      title: "Over estimate",
      body: `Effort (${formatEstimate(actualMin)}) is over the ${formatEstimate(estimatedMinutes)} estimate.`,
    };
  }
  return {
    tone: "good",
    title: "Good progress!",
    body: "Task is on track. Estimated completion within timeline.",
  };
}
