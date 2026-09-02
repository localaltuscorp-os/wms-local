"use client";

/**
 * Goals Canvas — SHARED SHELL CONTEXT.
 *
 * Lives in its own module (not goals-canvas.tsx) so the canvas units
 * (kpi-strip / parent-context-panel / child-planner / goals-board) and the
 * shell never form an import cycle: units import the hook from HERE; the
 * shell imports the units.
 *
 * The context carries the page props 1:1 PLUS the three pieces of shared
 * interactive state the shell owns:
 *   - `zoom`          — URL-backed zoom state (level + focused goal),
 *   - `filter` / `filteredGoals` — the smart-toolbar's active predicate applied
 *     to the loaded goal set (what the KPI strip + zoom canvas render),
 *   - `openPeek`      — opens the right-edge peek panel on a goal id.
 *
 * ZERO queries anywhere in this tree — everything derives from props.
 */

import * as React from "react";
import type { GoalPolicy } from "@/lib/goals/policy";
import type { ZoomState } from "./zoom-state";
import type { CascadeCanvasProps, GoalDTO, WeeklyDTO } from "./types";
import type { ActiveGoalFilter } from "./smart-toolbar";
import type { GoalMutationApi, WeeklyMutationApi } from "./optimistic";

export interface CanvasShellCtxValue extends CascadeCanvasProps {
  /**
   * Phase 2 (Option A) — the resolved permission policy for the VIEWED board
   * (goalPolicy over isAdmin/managesViewed/isOwner). Affordance gating only —
   * every action re-derives it server-side as the source of truth.
   */
  policy: GoalPolicy;
  /** URL-backed zoom state (z + focus), built over the FULL goal set. */
  zoom: ZoomState;
  /** The toolbar's active filter (null until it publishes; equivalent to "All"). */
  filter: ActiveGoalFilter | null;
  /** `goals` with the active predicate applied — the set the canvas shows.
   *  NOTE: `goals` (and this derived set) are the shell's OPTIMISTIC tree —
   *  edits land here instantly and reconcile with the server row (§3.4). */
  filteredGoals: GoalDTO[];
  /** Open the peek panel (right overlay) on a goal. */
  openPeek: (goalId: string) => void;
  /** The Phase-1 optimistic mutation spine — mutate local tree → fire action →
   *  reconcile with the returned row → rollback + toast on error. */
  mutation: GoalMutationApi;
  /**
   * Phase 3 — the LIVE weekly rows: the server payload with the optimistic
   * weekly overlay applied. Optional (historic contract); fall back to `weekly`.
   */
  weeklyLive?: WeeklyDTO[];
  /** Optimistic mutations for weekly rows (routes to weekly actions ONLY —
   *  ritual stamps live on weekly_goals; see lib/goals/node-adapter.ts). */
  weeklyMutation?: WeeklyMutationApi;
}

export const CanvasShellCtx = React.createContext<CanvasShellCtxValue | null>(null);

/** Canvas units call this to reach the shared props + zoom/filter/peek state. */
export function useCanvasShell(): CanvasShellCtxValue {
  const ctx = React.useContext(CanvasShellCtx);
  if (!ctx) throw new Error("useCanvasShell must be used inside <CascadeCanvas>");
  return ctx;
}
