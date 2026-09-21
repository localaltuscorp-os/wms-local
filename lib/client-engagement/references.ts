/**
 * CLIENT ENGAGEMENT — the Reference Pipeline's status, derived.
 *
 * Status is never stored: "overdue" depends on today, and a stored one would go
 * stale the day after it was written. Completed wins over everything — a quota
 * that is met is met, however late.
 *
 * PURE + CLIENT-SAFE.
 */

export type ReferenceStatus = "pending" | "in_progress" | "completed" | "overdue";

export const REFERENCE_STATUS_META: Record<ReferenceStatus, { label: string; tone: "slate" | "blue" | "green" | "red" }> = {
  pending: { label: "Pending", tone: "slate" },
  in_progress: { label: "In Progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  overdue: { label: "Overdue", tone: "red" },
};

export interface ReferenceInput {
  targetCount: number;
  actualCollected: number;
  dueDate: string | null;
}

export function referenceStatus(r: ReferenceInput, today: string): ReferenceStatus {
  if (r.actualCollected >= r.targetCount) return "completed";
  if (r.dueDate && today > r.dueDate) return "overdue";
  return r.actualCollected > 0 ? "in_progress" : "pending";
}

/** 0..1, capped. */
export function referenceProgress(r: ReferenceInput): number {
  if (r.targetCount <= 0) return 1;
  return Math.min(1, Math.max(0, r.actualCollected / r.targetCount));
}

/**
 * Should the weekly cron remind this collector today? Every-week quotas that are
 * not yet met, have a collector, and were not already reminded this week
 * (`mondayOfToday` is the Monday of the current week).
 */
export function needsWeeklyReminder(
  r: ReferenceInput & { frequency: string; collectorId: string | null; lastRemindedOn: string | null },
  mondayOfToday: string,
): boolean {
  if (r.frequency !== "every_week") return false;
  if (!r.collectorId) return false;
  if (r.actualCollected >= r.targetCount) return false;
  return !(r.lastRemindedOn && r.lastRemindedOn >= mondayOfToday);
}
