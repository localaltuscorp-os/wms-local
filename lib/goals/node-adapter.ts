/**
 * Goals — the NORMALIZED NODE ADAPTER (design doc
 * docs/superpowers/specs/2026-07-19-goals-redesign-DESIGN.md §4.3).
 *
 * One logical Year → Quarter → Month → Week objective is split across TWO
 * physical tables (`goals` for Y/Q/M, `weekly_goals` for W). This module papers
 * over that seam with a single `GoalNode` shape so the canvas UI never stitches
 * two row shapes.
 *
 * PURE + ISOMORPHIC — no `server-only`, no DB, no React. Numerics (the
 * numeric(14,2) columns that round-trip as strings) are parsed to numbers via
 * the canonical `asNum` (lib/goals/derive.ts) so every consumer does math on
 * one representation.
 *
 * ⚠ WRITE ROUTING (critical): a node's `kind` decides which PHYSICAL table a
 * mutation must land on — `cascade` → `goals`, `weekly` → `weekly_goals`.
 * The Saturday-commit / Monday-approve ritual stamps (`committedAt`,
 * `approvedByManagerAt`) and the punch-gate predicates read `weekly_goals`
 * directly, so a weekly node must NEVER be written through a `goals` action
 * (and vice versa). Use `writeTableOf(node)` / the per-kind action sets and
 * never guess from the id.
 */

import type { GoalPeriod } from "./types";
import { asNum } from "./derive";

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export type GoalNodeKind = "cascade" | "weekly";
export type GoalNodeLevel = "year" | "quarter" | "month" | "week";

/** The physical table a node's writes must route to (ritual stamps live on
 *  `weekly_goals`; cascade rollup columns live on `goals`). */
export const NODE_TABLE: Record<GoalNodeKind, "goals" | "weekly_goals"> = {
  cascade: "goals",
  weekly: "weekly_goals",
};

/** Weekly-only facet — `undefined` on cascade nodes (design §4.3). */
export interface WeeklyFacet {
  /** Monday "YYYY-MM-DD" bucket of the week. */
  weekStart: string;
  subject: string | null;
  client: string | null;
  /** The free-text target — when it's the ONLY target the row is "unmeasured"
   *  (locked decision 3) and excluded from numeric rollup/contribution. */
  targetDone: string | null;
  priority: string | null;
  taskId: string | null;
  incentive: boolean;
  incentiveAmount: number;
  incentiveType: string | null;
  kpi: boolean;
  /** Saturday freeze stamp — read by the commit punch gate. */
  committedAt: Date | string | null;
  /** Monday manager-approval stamp — read by the approve punch gate. */
  approvedByManagerAt: Date | string | null;
}

/**
 * The one normalized node the canvas renders — a superset view over
 * `goals` (Y/Q/M) and `weekly_goals` (W) rows, numerics parsed to numbers.
 */
export interface GoalNode {
  id: string;
  kind: GoalNodeKind;
  level: GoalNodeLevel;
  employeeId: string;
  /** cascade → `parentGoalId`; weekly → `monthGoalId` (the month `goals` row). */
  parentId: string | null;
  /** cascade → `periodKey` ("2026" / "2026-Q2" / "2026-07");
   *  weekly → `weekStart` Monday "YYYY-MM-DD" (a valid `periodBounds` key). */
  periodKey: string;
  position: number;
  area: string | null;
  title: string;
  uom: string | null;
  targetQty: number | null;
  actualQty: number | null;
  targetAmount: number | null;
  actualAmount: number | null;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  adopted: boolean;
  /** Kanban tag on cascade rows; weekly rows carry none → null. */
  category: string | null;
  /** 'cascade' | 'manual' | … — weekly derives it from the month link. */
  source: string;
  /** Carry-forward provenance (goals.clonedFromId / weekly.carriedFromId);
   *  set + effective < 100 ⇒ spillover. */
  clonedFromId: string | null;
  notes: string | null;
  evidenceUrl: string | null;
  teamInvolved: Array<{ employeeId?: string; name?: string }> | null;
  teamDependencyPct: number | null;
  /** Present ONLY on weekly nodes. */
  weekly?: WeeklyFacet;
}

/* ------------------------------------------------------------------ */
/* Input row shapes (structural — DB rows AND client DTOs satisfy them) */
/* ------------------------------------------------------------------ */

/** A `goals` row / GoalDTO — the Y/Q/M side. Numerics may be string or number. */
export interface CascadeRowInput {
  id: string;
  employeeId: string;
  period: GoalPeriod | string;
  periodKey: string;
  parentGoalId: string | null;
  position: number;
  area: string | null;
  title: string;
  uom: string | null;
  targetQty: string | number | null;
  actualQty: string | number | null;
  targetAmount: string | number | null;
  actualAmount: string | number | null;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  adopted: boolean;
  source: string;
  category: string | null;
  clonedFromId: string | null;
  notes?: string | null;
  evidenceUrl?: string | null;
  teamInvolved?: Array<{ employeeId?: string; name?: string }> | null;
  teamDependencyPct?: number | null;
}

/** A `weekly_goals` row — the W leaf. `monthGoalId` is REQUIRED so parent
 *  linkage survives normalization (the trimmed client WeeklyDTO drops it). */
export interface WeeklyRowInput {
  id: string;
  employeeId: string;
  weekStart: string;
  monthGoalId: string | null;
  position: number;
  subject: string | null;
  client: string | null;
  targetDone: string | null;
  area: string | null;
  uom: string | null;
  targetQty: string | number | null;
  actualQty: string | number | null;
  targetAmount: string | number | null;
  actualAmount: string | number | null;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  adopted: boolean;
  carriedFromId: string | null;
  notes?: string | null;
  evidenceUrl?: string | null;
  teamInvolved?: Array<{ employeeId?: string; name?: string }> | null;
  teamDependencyPct?: number | null;
  priority?: string | null;
  taskId?: string | null;
  incentive?: boolean;
  incentiveAmount?: number;
  incentiveType?: string | null;
  kpi?: boolean;
  committedAt?: Date | string | null;
  approvedByManagerAt?: Date | string | null;
}

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

/** Normalize a Y/Q/M `goals` row (DB row or GoalDTO) into a GoalNode. */
export function toNodeFromCascade(r: CascadeRowInput): GoalNode {
  return {
    id: r.id,
    kind: "cascade",
    level: r.period as GoalNodeLevel, // 'year' | 'quarter' | 'month'
    employeeId: r.employeeId,
    parentId: r.parentGoalId,
    periodKey: r.periodKey,
    position: r.position,
    area: r.area,
    title: r.title,
    uom: r.uom,
    targetQty: asNum(r.targetQty),
    actualQty: asNum(r.actualQty),
    targetAmount: asNum(r.targetAmount),
    actualAmount: asNum(r.actualAmount),
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    weight: r.weight,
    adopted: r.adopted,
    category: r.category ?? null,
    source: r.source,
    clonedFromId: r.clonedFromId,
    notes: r.notes ?? null,
    evidenceUrl: r.evidenceUrl ?? null,
    teamInvolved: r.teamInvolved ?? null,
    teamDependencyPct: r.teamDependencyPct ?? null,
  };
}

/** Normalize a `weekly_goals` row into a GoalNode (level 'week'). Title
 *  precedence matches the cascade page: targetDone → subject → fallback. */
export function toNodeFromWeekly(r: WeeklyRowInput): GoalNode {
  return {
    id: r.id,
    kind: "weekly",
    level: "week",
    employeeId: r.employeeId,
    parentId: r.monthGoalId,
    periodKey: r.weekStart,
    position: r.position,
    area: r.area,
    title: r.targetDone?.trim() || r.subject?.trim() || "Weekly goal",
    uom: r.uom,
    targetQty: asNum(r.targetQty),
    actualQty: asNum(r.actualQty),
    targetAmount: asNum(r.targetAmount),
    actualAmount: asNum(r.actualAmount),
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    weight: r.weight,
    adopted: r.adopted,
    category: null,
    source: r.monthGoalId != null ? "cascade" : "manual",
    clonedFromId: r.carriedFromId,
    notes: r.notes ?? null,
    evidenceUrl: r.evidenceUrl ?? null,
    teamInvolved: r.teamInvolved ?? null,
    teamDependencyPct: r.teamDependencyPct ?? null,
    weekly: {
      weekStart: r.weekStart,
      subject: r.subject,
      client: r.client,
      targetDone: r.targetDone,
      priority: r.priority ?? null,
      taskId: r.taskId ?? null,
      incentive: r.incentive ?? false,
      incentiveAmount: r.incentiveAmount ?? 0,
      incentiveType: r.incentiveType ?? null,
      kpi: r.kpi ?? false,
      committedAt: r.committedAt ?? null,
      approvedByManagerAt: r.approvedByManagerAt ?? null,
    },
  };
}

/** Kind-dispatched normalizer (design §4.3 `toNode(row, kind)`). */
export function toNode(row: CascadeRowInput, kind: "cascade"): GoalNode;
export function toNode(row: WeeklyRowInput, kind: "weekly"): GoalNode;
export function toNode(row: CascadeRowInput | WeeklyRowInput, kind: GoalNodeKind): GoalNode {
  return kind === "cascade"
    ? toNodeFromCascade(row as CascadeRowInput)
    : toNodeFromWeekly(row as WeeklyRowInput);
}

/** The physical table this node's writes must route to (see module header). */
export function writeTableOf(node: Pick<GoalNode, "kind">): "goals" | "weekly_goals" {
  return NODE_TABLE[node.kind];
}

/** Type guard — narrow to a node whose ritual stamps are meaningful. */
export function isWeeklyNode(node: GoalNode): node is GoalNode & { weekly: WeeklyFacet } {
  return node.kind === "weekly" && node.weekly !== undefined;
}
