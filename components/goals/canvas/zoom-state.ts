"use client";

/**
 * Goals Canvas — URL-backed zoom state (FOUNDATION).
 *
 * nuqs keeps the whole canvas parameterisation in the URL so back/forward/
 * refresh restore the exact view and deep-links work:
 *   /goals/cascade?z=month&focus=<goalId>&wk=2026-07-13&r=list
 *
 *   z     — zoom level (year · quarter · month · week · day)
 *   focus — focused goal id (the LEFT parent-context subject)
 *   wk    — focused week Monday "YYYY-MM-DD" (z = week/day only)
 *   pk    — last PICKED period key ("2026-Q3" / "2027-02"): a parent-picker tab
 *           click on a goal-LESS bucket carries the clicked bucket here so the
 *           stage focuses THAT bucket, not the current-period fallback (bug #14)
 *   r     — list | board representation (design §2.5). The DEFAULT is
 *           page-supplied (Phase 3 front door: quarterly/monthly default to
 *           "board") — a bare URL stays clean either way.
 *   q     — friendly quarter SUGAR ("Q2", shareable): resolved against the
 *           page's FY to a quarter periodKey and rewritten into ?pk in place
 *           (history replace) — pk stays the ONE carrier (bug #14).
 *
 * (The old `v` exec/ops re-skin is GONE — unification made the ops card the
 *  one surface; `canWrite` + policy decide what's touchable, not a mode.)
 *
 * `NuqsAdapter` is already mounted in app/layout.tsx — do NOT re-wrap.
 * Pure client derivation over the props-passed goals array — ZERO queries.
 * Zoom is STATE only — never a CSS zoom/transform on ancestors.
 */

import * as React from "react";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import {
  CANVAS_REPRS,
  ZOOM_LEVELS,
  type CanvasRepr,
  type GoalDTO,
  type ZoomLevel,
} from "./types";

/* ------------------------------------------------------------------ */
/* Public shape                                                        */
/* ------------------------------------------------------------------ */

export interface ZoomState {
  /** Current semantic zoom level. Defaults to "year". */
  z: ZoomLevel;
  /** Focused goal id, or null when nothing is focused (whole-level view). */
  focus: string | null;
  /** The focused GoalDTO resolved from the tree (null if focus unset/stale). */
  focusedGoal: GoalDTO | null;
  /** Focused week Monday ("YYYY-MM-DD") — set only at week/day zoom. */
  wk: string | null;
  /** Last PICKED period key ("2026" / "2026-Q3" / "2027-02") — set only when a
   *  parent-picker tab selected a goal-LESS bucket; cleared by every focusNode
   *  that names a goal (the goal carries its own key). Bug #14. */
  pk: string | null;
  /** List/Board representation of the child planner (design §2.5). */
  repr: CanvasRepr;
  /** Ancestor chain of the focused goal, root-first (excludes the goal itself).
   *  Empty when nothing is focused or the goal is a root. */
  ancestors: GoalDTO[];
  /** Same-parent siblings of the focused goal (INCLUDES it, position-sorted);
   *  for root goals: all roots sharing its periodKey. Empty when unfocused. */
  siblings: GoalDTO[];
  /** Step one level deeper (year→…→day), optionally focusing a node. */
  zoomIn: (focusId?: string) => void;
  /** Step one level up; week→month clears `wk`; focus walks to the ancestor. */
  zoomOut: () => void;
  /** Focus a goal (null clears). Optionally jump to a zoom level with it.
   *  Jumping to year/quarter/month clears the focused week. `periodKey` carries
   *  the CLICKED bucket for goal-less selections (bug #14); omitted → cleared. */
  focusNode: (goalId: string | null, z?: ZoomLevel, periodKey?: string | null) => void;
  /** Focus a week Monday (null clears), optionally jumping levels ("week"). */
  focusWeek: (weekStart: string | null, z?: ZoomLevel) => void;
  /** Set the zoom level directly (focus preserved). */
  setLevel: (z: ZoomLevel) => void;
  setRepr: (r: CanvasRepr) => void;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/** ONE parser for the ?q sugar: "Q2" (case/space-lenient) + the page's FY →
 *  the canonical quarter periodKey ("2026-Q2"); null when malformed. ?q is
 *  strictly sugar over ?pk — nothing else ever reads it. */
export function quarterSugarToPeriodKey(q: string, fyStartYear: number): string | null {
  const m = /^\s*q([1-4])\s*$/i.exec(q);
  return m ? `${fyStartYear}-Q${m[1]}` : null;
}

/** Build the id→goal + parent→children indices once per payload. */
function useGoalIndex(goals: GoalDTO[]) {
  return React.useMemo(() => {
    const byId = new Map<string, GoalDTO>();
    for (const g of goals) byId.set(g.id, g);
    return { byId };
  }, [goals]);
}

export function useZoomState(
  goals: GoalDTO[],
  defaultLevel: ZoomLevel = "year",
  opts?: {
    /** Page default for `r` (Phase 3 front door) — bare URLs stay param-free. */
    defaultRepr?: CanvasRepr;
    /** Enables the ?q quarter sugar (needed to resolve "Q2" → "2026-Q2"). */
    fyStartYear?: number;
  },
): ZoomState {
  // The page's level is the URL DEFAULT (nuqs strips the param when it equals
  // the default) — so a bare `/goals/week` renders the month stage with NO
  // history write, and same-page sidebar clicks are idempotent. history:"push"
  // still lets Back walk any DEEPER drills the user performs (blueprint §3).
  const [zRaw, setZ] = useQueryState(
    "z",
    parseAsStringLiteral(ZOOM_LEVELS).withDefault(defaultLevel).withOptions({ history: "push" }),
  );
  const [focusRaw, setFocus] = useQueryState(
    "focus",
    parseAsString.withOptions({ history: "push" }),
  );
  const [wkRaw, setWk] = useQueryState("wk", parseAsString.withOptions({ history: "push" }));
  // bug #14 — the picked-bucket key (parent-picker clicks on goal-less tabs).
  const [pkRaw, setPk] = useQueryState("pk", parseAsString.withOptions({ history: "push" }));
  // Re-skins REPLACE history (toggling repr should not pollute Back). The
  // default is PAGE-supplied (stable per mount) so /goals/quarterly + /monthly
  // open on the period board while a bare URL stays clean.
  const defaultRepr = opts?.defaultRepr ?? "list";
  const reprParser = React.useMemo(
    () => parseAsStringLiteral(CANVAS_REPRS).withDefault(defaultRepr),
    [defaultRepr],
  );
  const [repr, setReprRaw] = useQueryState("r", reprParser);

  // ?q sugar → ?pk carrier: a shareable /goals/quarterly?q=Q2 deep-link
  // resolves against the page's FY and rewrites itself into the existing
  // picked-bucket param (bug #14) with NO history step — the board scrolls/
  // highlights and the scorecard scopes off pk exactly like a picker click.
  const fyForSugar = opts?.fyStartYear;
  const [qRaw, setQ] = useQueryState("q", parseAsString);
  React.useEffect(() => {
    if (!qRaw || fyForSugar == null) return;
    const resolved = quarterSugarToPeriodKey(qRaw, fyForSugar);
    if (resolved) void setPk(resolved, { history: "replace" });
    void setQ(null, { history: "replace" }); // consume the sugar either way
  }, [qRaw, fyForSugar, setPk, setQ]);

  const { byId } = useGoalIndex(goals);

  // Sanitize: a stale/foreign focus id (deleted goal, other employee's URL)
  // resolves to null rather than crashing the derivations.
  const focusedGoal = focusRaw ? (byId.get(focusRaw) ?? null) : null;
  const focus = focusedGoal ? focusedGoal.id : null;
  const z: ZoomLevel = zRaw;
  const wk = wkRaw && /^\d{4}-\d{2}-\d{2}$/.test(wkRaw) ? wkRaw : null;
  // Accept only the three period-key shapes ("2026" / "2026-Q3" / "2027-02").
  const pk = pkRaw && /^\d{4}(?:-(?:Q[1-4]|\d{2}))?$/.test(pkRaw) ? pkRaw : null;

  const ancestors = React.useMemo<GoalDTO[]>(() => {
    if (!focusedGoal) return [];
    const chain: GoalDTO[] = [];
    let cur: GoalDTO | undefined = focusedGoal;
    const seen = new Set<string>([focusedGoal.id]); // cycle guard
    while (cur?.parentGoalId) {
      const parent = byId.get(cur.parentGoalId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      chain.unshift(parent); // root-first
      cur = parent;
    }
    return chain;
  }, [focusedGoal, byId]);

  const siblings = React.useMemo<GoalDTO[]>(() => {
    if (!focusedGoal) return [];
    const sibs = focusedGoal.parentGoalId
      ? goals.filter((g) => g.parentGoalId === focusedGoal.parentGoalId)
      : goals.filter((g) => g.parentGoalId == null && g.periodKey === focusedGoal.periodKey);
    return [...sibs].sort((a, b) => a.position - b.position);
  }, [focusedGoal, goals]);

  const zoomIn = React.useCallback(
    (focusId?: string) => {
      const i = ZOOM_LEVELS.indexOf(z);
      const next = ZOOM_LEVELS[Math.min(i + 1, ZOOM_LEVELS.length - 1)] ?? "month";
      void setZ(next);
      if (focusId !== undefined) void setFocus(focusId || null);
    },
    [z, setZ, setFocus],
  );

  const zoomOut = React.useCallback(() => {
    if (z === "day") {
      void setZ("week");
      return;
    }
    if (z === "week") {
      // Week → month: drop the week param; the month goal stays focused.
      void setWk(null);
      void setZ("month");
      return;
    }
    const i = ZOOM_LEVELS.indexOf(z);
    const prev = ZOOM_LEVELS[Math.max(i - 1, 0)] ?? "year";
    void setZ(prev);
    // Focus follows the hierarchy up: focused node → its parent → cleared.
    const parentId = focusedGoal?.parentGoalId ?? null;
    void setFocus(parentId);
  }, [z, setZ, setFocus, setWk, focusedGoal]);

  const focusNode = React.useCallback(
    (goalId: string | null, level?: ZoomLevel, periodKey?: string | null) => {
      void setFocus(goalId);
      // bug #14 — a goal-less tab click carries the CLICKED bucket; any other
      // explicit selection clears it (a focused goal names its own key).
      void setPk(periodKey ?? null);
      if (level) {
        void setZ(level);
        if (level === "year" || level === "quarter" || level === "month") void setWk(null);
      }
    },
    [setFocus, setPk, setZ, setWk],
  );

  const focusWeek = React.useCallback(
    (weekStart: string | null, level?: ZoomLevel) => {
      void setWk(weekStart);
      if (level) void setZ(level);
    },
    [setWk, setZ],
  );

  const setLevel = React.useCallback((level: ZoomLevel) => void setZ(level), [setZ]);
  const setRepr = React.useCallback((r: CanvasRepr) => void setReprRaw(r), [setReprRaw]);

  return {
    z,
    focus,
    focusedGoal,
    wk,
    pk,
    repr,
    ancestors,
    siblings,
    zoomIn,
    zoomOut,
    focusNode,
    focusWeek,
    setLevel,
    setRepr,
  };
}
