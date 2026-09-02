"use client";

/**
 * Goals Canvas — DRAG BRIDGE (Phase 5, brief §4).
 *
 * The sidebar's five Goals level items live OUTSIDE the board's DndContext —
 * hoisting a global context would couple the app chrome to the canvas. Instead
 * this tiny module store bridges the two worlds:
 *
 *   · goals-board.tsx PUBLISHES here on drag start/move/end (the dragged
 *     GoalDTO + the Option-A policy verdicts + which nav level the pointer is
 *     over, hit-tested against the cached `[data-goal-drop-level]` rects),
 *   · the sidebar's GoalNavDropWrap (components/layout/goals-nav-drop.tsx)
 *     SUBSCRIBES via useSyncExternalStore and paints the drop affordance.
 *
 * Snapshot objects are immutable (replaced wholesale on change) so the
 * useSyncExternalStore identity contract holds. Zero React state, zero
 * queries — a plain module singleton, same lifetime as the page.
 */

import * as React from "react";
import type { GoalDTO, ZoomLevel } from "./types";

export interface GoalDragState {
  /** The goals-table row being dragged (null = no bridge drag active). */
  dragging: GoalDTO | null;
  /** The dragged row's own level — dropping HERE is a same-level bucket move. */
  sourceLevel: GoalDTO["period"] | null;
  /** Option-A verdicts, resolved by the publisher (affordance only — the
   *  server re-derives): cross-level re-home / same-level re-bucket. */
  canRehomeLevel: boolean;
  canReQuarter: boolean;
  /** The nav level item the pointer is currently over (hit-test), else null. */
  overLevel: ZoomLevel | null;
}

const IDLE: GoalDragState = {
  dragging: null,
  sourceLevel: null,
  canRehomeLevel: false,
  canReQuarter: false,
  overLevel: null,
};

let state: GoalDragState = IDLE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function publishGoalDrag(
  g: GoalDTO,
  policy: { canRehomeLevel: boolean; canReQuarter: boolean },
): void {
  state = { dragging: g, sourceLevel: g.period, ...policy, overLevel: null };
  emit();
}

export function publishOverLevel(level: ZoomLevel | null): void {
  if (state.dragging == null || state.overLevel === level) return;
  state = { ...state, overLevel: level };
  emit();
}

export function endGoalDrag(): void {
  if (state === IDLE) return;
  state = IDLE;
  emit();
}

/** Imperative read (the board's onDragEnd reads it BEFORE publishing end). */
export function getGoalDragSnapshot(): GoalDragState {
  return state;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive subscription for painters (sidebar wrap, level dock). */
export function useGoalDrag(): GoalDragState {
  return React.useSyncExternalStore(subscribe, getGoalDragSnapshot, () => IDLE);
}

/** Friendly names for the five drop levels — sidebar hover label ("Move to
 *  Monthly"), dock chips, aria announcements. */
export const DROP_LEVEL_LABEL: Record<ZoomLevel, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};
