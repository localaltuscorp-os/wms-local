import type { TaskStatus } from "@/db/enums";

/**
 * Client DTO for one weekly goal on the Monday approval surface. numeric(14,2)
 * columns arrive as strings (drizzle); `committed`/`approved` are collapsed to
 * booleans from their timestamp columns for the client.
 */
export interface ApproveGoal {
  id: string;
  employeeId: string;
  weekStart: string;
  position: number;
  subject: string | null;
  client: string | null;
  area: string | null;
  uom: string | null;
  targetDone: string | null;
  notes: string | null;
  status: TaskStatus;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  teamDependencyPct: number | null;
  evidenceUrl: string | null;
  linkUrl: string | null;
  committed: boolean;
  approved: boolean;
}

/** One downline member with their last-week + this-week adopted goals. */
export interface ApproveMember {
  id: string;
  name: string;
  lastWeek: ApproveGoal[];
  thisWeek: ApproveGoal[];
}

/** Effective % = manager-accepted once reviewed, else the doer's self %. */
export function effective(g: { acceptPct: number | null; pctDone: number }): number {
  return g.acceptPct ?? g.pctDone;
}

/** Google-style completion colour: ≥70 green, 40–69 amber, <40 red. */
export function scoreColor(pct: number): string {
  if (pct >= 70) return "var(--color-green)";
  if (pct >= 40) return "var(--color-amber, #d97706)";
  return "var(--color-altus-red)";
}

/** A week's goals are "signed off" when every one carries a manager stamp. */
export function allApproved(goals: ApproveGoal[]): boolean {
  return goals.length > 0 && goals.every((g) => g.approved);
}
