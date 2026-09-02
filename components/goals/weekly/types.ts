/**
 * Shared client types for the Goals-workspace Weekly board. A trimmed, cascade-
 * focused shape (NOT the legacy `BoardGoal`) — it carries only what this surface
 * renders: the monthly-goal linkage, the adopt toggle, and the cascade fields.
 * numeric(14,2) columns arrive as STRINGs (or null) and stay strings until edit.
 */

export interface TeamMember {
  employeeId?: string;
  name?: string;
}

export interface CascadeWeeklyGoal {
  id: string;
  employeeId: string;
  employeeName: string;
  weekStart: string;
  position: number;
  /** The "goal" text (weekly subject) + its explicit target-done phrasing. */
  subject: string | null;
  targetDone: string | null;
  area: string | null;
  uom: string | null;
  // numeric(14,2) → string | null
  targetQty: string | null;
  targetAmount: string | null;
  actualQty: string | null;
  actualAmount: string | null;
  teamInvolved: TeamMember[];
  teamDependencyPct: number | null;
  /** Column parity with Y/Q/M goals — the inline table's Type/Status/Reviewer/
   *  Share/Delegated columns render + edit these on the Weekly board too. */
  goalType: string | null;
  status: string | null;
  reviewedById: string | null;
  shareWithTeam: boolean;
  delegatedTo: Array<{ employeeId: string; name?: string; pct: number }> | null;
  evidenceUrl: string | null;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  adopted: boolean;
  committed: boolean;
  approvedByManager: boolean;
  carriedFromId: string | null;
  monthGoalId: string | null;
  monthGoalTitle: string | null;
  /** Deadline (ISO 'YYYY-MM-DD') — weekly_goals.target_date, or null. */
  targetDate: string | null;
  /** Who created the row + when — drives the Self / Assigned assignment type. */
  createdById: string | null;
  createdAt: string | null;
}

/** An active/inactive employee used to resolve Team Involved + the add picker. */
export interface RosterMember {
  id: string;
  name: string;
  isActive: boolean;
}

/** A monthly cascade goal a weekly row can be linked up to (parent). */
export interface MonthGoalOption {
  id: string;
  title: string;
  area: string | null;
}

export interface BoardMe {
  id: string;
  isAdmin: boolean;
}
