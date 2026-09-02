/**
 * Goals LEVEL BOARD — shared types (client-safe, no server imports).
 *
 * The board is the weekly-goals-board design applied to the GOALS table:
 * one person's goals at ONE level (year / quarter / month), scoped to one
 * period bucket, with period pills to hop (and drag cards) between sibling
 * buckets. The server page loads `loadBoardData` (app/(app)/goals/board-data.ts)
 * and spreads it into `GoalsLevelBoard` together with the route's level +
 * selected bucket.
 */
import type { GoalDTO, RosterMember } from "@/components/goals/cascade/util";
import type { GoalPeriod } from "@/lib/goals/types";

/** The exact payload the level board needs — returned by `loadBoardData`. */
export interface GoalsBoardData {
  /** EVERY non-archived cascade goal (all levels) for the viewed person + FY —
   *  one payload feeds the bucket counts, the quick-add's parent resolution
   *  and cross-bucket drag reconciliation without refetching. */
  goals: GoalDTO[];
  /** The viewed person's weekly cascade rows (from `weekly_goals`) for the FY,
   *  mapped to period="week" GoalDTOs — the Monthly hierarchy Kanban's week-lane
   *  cards. Empty on levels/spaces without weekly rows. Re-homing one between
   *  weeks writes its `week_start` (moveWeeklyToWeek), not the goals-table move. */
  weekCards: GoalDTO[];
  fyStartYear: number;
  /** The signed-in viewer (tells "mine" from a managed downline's board). */
  myEmployeeId: string;
  viewedEmployeeId: string;
  viewedName: string;
  roster: RosterMember[];
  /** Viewer may write the viewed person's goals at all. */
  canWrite: boolean;
  canReview: boolean;
  /* Option-A policy identity (lib/goals/policy.ts goalPolicy input). */
  isAdmin: boolean;
  managesViewed: boolean;
  /** Active goals space (mig 0150): "professional" (shared) | "personal". */
  space: "professional" | "personal";
  /** Area dropdown options (base + admin-added), migration 0148. */
  areaOptions: string[];
  /** Measure dropdown options (→ goals.uom): base + admin-added. */
  measureOptions: string[];
  /** Type dropdown options (→ goals.category): base + admin-added. */
  typeOptions: string[];
  /** Goal-Type taxonomy options (→ goals.goal_type): base + admin-added (#194). */
  goaltypeOptions: string[];
  /** The admin-added (deletable) subset per kind — base options aren't here. */
  customLookups: { areas: string[]; measures: string[]; types: string[]; goaltypes: string[] };
  /** Goal Capture (mig 0173) available — an OPENROUTER_API_KEY is set and the
   *  kill-switch is off. Drives whether the "Capture goals with AI" box shows. */
  captureEnabled: boolean;
  /** Voice capture available — a WHISPER_API_KEY is also set. Drives the mic. */
  voiceEnabled: boolean;
  /** "Part of Project?" pickers (mig 0184). Optional so any caller that doesn't
   *  load them still typechecks — the pickers just render empty. */
  projects?: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
}

export interface GoalsLevelBoardProps extends GoalsBoardData {
  /** The level this page is locked to. */
  level: GoalPeriod;
  /** The selected bucket at `level` ("2026" / "2026-Q1" / "2026-07"). */
  periodKey: string;
  /** The page's own route ("/goals/quarterly") — bucket/person/FY nav pushes
   *  query params onto THIS path so the URL stays shareable. */
  basePath: string;
  /** Page H1 ("Quarterly Goals"). */
  heading: string;
  /** One-line subtitle under the H1. */
  tagline?: string;
  /** Deep-link: scroll to + open this goal's drawer on mount. */
  focusId?: string | null;
}
