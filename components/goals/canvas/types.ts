/**
 * Goals Canvas — shared type contracts (FOUNDATION; no React, no JSX, no queries).
 *
 * Every canvas component (KPI strip, smart toolbar, zoom canvas, peek panel)
 * builds STRICTLY against these types. All data is derived client-side from the
 * DTO arrays the server page already passes — components must never fetch.
 *
 * See docs/superpowers/specs/goals-canvas-BLUEPRINT.md for the full contracts.
 */

import type { GoalDTO, RosterMember } from "@/components/goals/cascade/util";
import type { WeeklyDTO } from "@/components/goals/cascade/cascade-workspace";
import type { AssignedGoal } from "@/lib/goals/queries";

// Re-export the source DTO types so canvas units import from ONE place.
export type { GoalDTO, RosterMember, WeeklyDTO, AssignedGoal };

/* ------------------------------------------------------------------ */
/* Zoom                                                                */
/* ------------------------------------------------------------------ */

/**
 * Semantic zoom levels — ONE objective at five depths (design §2.1).
 * Phase 3 folded `week` in as a real, EDITABLE zoom stage (no longer a drill
 * inside month); Phase 5 folded `day` in as the deepest stage — the
 * Plan-Your-Day surface rendered inline (same component as /goals/plan).
 * Order matters: zoomIn/zoomOut walk this array by index.
 */
export const ZOOM_LEVELS = ["year", "quarter", "month", "week", "day"] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

/** Representation of the child planner — List today, Kanban in Phase 4 (§2.5). */
export const CANVAS_REPRS = ["list", "board"] as const;
export type CanvasRepr = (typeof CANVAS_REPRS)[number];

/** Board lane groupings (goals-board.tsx) — shared here so pages can name a
 *  DEFAULT lane (`defaultLane`) without importing the board component. */
export const LANE_MODES = ["category", "health", "period", "week", "adopted"] as const;
export type LaneMode = (typeof LANE_MODES)[number];

/* ------------------------------------------------------------------ */
/* Client-derived health (NO DB columns — pure pace math)              */
/* ------------------------------------------------------------------ */

export type HealthBand = "done" | "ahead" | "on-track" | "at-risk" | "spillover";

/**
 * Health derived per blueprint §5 (Viva pace rule, fixed 25-pt cut):
 *  1. spillover (clonedFromId/carriedFromId set && effective < 100)
 *  2. effective >= 100 → done
 *  3. delta >= 0       → ahead
 *  4. delta > -25      → on-track
 *  5. delta <= -25     → at-risk
 */
export interface DerivedHealth {
  band: HealthBand;
  /** effectiveGoalPct: acceptPct ?? pctDone (0..100). */
  effective: number;
  /** Linear elapsed-time expectation over the period bounds, clamped 0..100. */
  expected: number;
  /** effective − expected (negative = behind pace). */
  delta: number;
  /** Ready-to-render pill styling (semantic hexes from blueprint §8.1). */
  color: string;
  bg: string;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Shell props — IDENTICAL to CascadeWorkspace so the page swaps 1:1   */
/* ------------------------------------------------------------------ */

export interface CascadeCanvasProps {
  goals: GoalDTO[];
  weekly: WeeklyDTO[];
  assigned: AssignedGoal[];
  fyStartYear: number;
  viewedEmployeeId: string;
  viewedName: string;
  roster: RosterMember[];
  canWrite: boolean;
  /**
   * Bug #15 — the SIGNED-IN viewer's employee id (`me.id`, server-resolved),
   * distinct from `viewedEmployeeId` when a manager/admin views someone else's
   * board. Powers the toolbar's "My goals" pill (hidden when equal/absent).
   * OPTIONAL + additive: CascadeWorkspace's prop contract is untouched.
   */
  myEmployeeId?: string;
  /**
   * Phase 6 (design §2.6) — the daily-flow ritual GATE flags (server env,
   * default OFF), so the RitualBanner only auto-surfaces the states that
   * actually block the punch. OPTIONAL + additive: the page passes it to
   * GoalsCanvas only; CascadeWorkspace's prop contract is untouched.
   */
  ritualGates?: { satCommit: boolean; monApprove: boolean };
  /**
   * Phase 7 — whether the CALLER may review-accept the viewed person's goals
   * (admin, or a manager viewing a downline member; a person never reviews
   * their own goals — resolveGoalsView.canReview). Powers the LEFT-panel
   * Review scorecard's accept-% controls. OPTIONAL + additive: the page passes
   * it to GoalsCanvas only; CascadeWorkspace's prop contract is untouched.
   */
  canReview?: boolean;
  /**
   * Phase 2 (Option A admin policy) — the two identity facts the shell feeds
   * `goalPolicy()` with (together with myEmployeeId === viewedEmployeeId):
   *   `isAdmin`       — the signed-in viewer has org-wide reach.
   *   `managesViewed` — the viewer manages the VIEWED person (downline; never
   *                     true when viewing yourself).
   * Affordance gating ONLY — the server actions re-derive the policy as the
   * source of truth. OPTIONAL + additive: absent ⇒ no structure rights.
   */
  isAdmin?: boolean;
  managesViewed?: boolean;
  /**
   * Level-page mode (the 5-page restructure): when set, the canvas mounts LOCKED
   * to this zoom level and the in-canvas level selector is hidden — the SIDEBAR
   * is the level navigator. The parent picker (which quarter/month) stays. When
   * absent, the canvas is the free zoomable shell (legacy /goals/cascade).
   */
  initialZoom?: ZoomLevel;
  /** Hide the in-canvas level selector (the sidebar drives the level). */
  hideLevelNav?: boolean;
  /**
   * Phase 3 front door — the page's DEFAULT representation, threaded into the
   * nuqs `r` parser's `.withDefault(...)`: /goals/quarterly + /goals/monthly
   * default to the period-lane BOARD (Q1–Q4 / the 3 month columns) with a bare
   * URL staying clean (nuqs strips params equal to the default); List is one
   * toggle away. Absent ⇒ "list" (cascade + every other page unchanged).
   */
  defaultRepr?: CanvasRepr;
  /** The board's default lane grouping for this page ("period" on the level
   *  front doors). Absent ⇒ the stage's first mode (category/week). */
  defaultLane?: LaneMode;
  /**
   * Yearly rootView (the 5th level page, /goals/yearly): at `year` zoom the
   * canvas shows the FY PORTFOLIO — focus is treated as null (LEFT = the slim
   * FY summary) and the RIGHT pane lists the FY's YEAR-level objectives
   * themselves; drilling one navigates to /goals/quarterly focused on it.
   * OPTIONAL + strictly additive: absent, every existing page is untouched.
   */
  rootView?: boolean;
}
