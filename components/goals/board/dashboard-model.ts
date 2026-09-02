/**
 * GOALS DASHBOARD — the shared MODEL layer (no JSX, no React).
 *
 * Lifted verbatim out of `goals-dashboard.tsx` so the Weekly dashboard
 * (`components/goals/weekly/weekly-dashboard.tsx`) can render a different
 * LAYOUT over the exact same NUMBERS. Two dashboards computing "weighted
 * attainment" or "at risk" from two copies of this arithmetic would drift the
 * first time either was touched; there is one copy, and it lives here.
 *
 * Everything is a pure client-side projection over goals the board already
 * holds — no queries, no mutation, no data model of its own. Health / pace /
 * forecast all come from the canonical engine in `lib/goals/derive.ts`
 * (`deriveHealth` · `expectedPct` · `rollupPct`), never from static cutoffs.
 */

import {
  type GoalDTO,
  type RosterMember,
  effectiveGoalPct,
  targetDateStatus,
  assignmentInfo,
  isSpillover,
} from "@/components/goals/cascade/util";
import { deriveHealth, rollupPct, expectedPct, asNum, type DerivedHealth } from "@/lib/goals/derive";
import { GOAL_TYPE_LABELS, type GoalType } from "@/db/enums";
import { quartersOfFy, type GoalPeriod } from "@/lib/goals/types";

/* ── Semantic status hexes (mirror lib/goals/derive HEALTH_STYLE) ──────── */
export const GREEN = "#15803d"; // done / healthy
export const GREEN_BRIGHT = "#16a34a"; // ahead of pace
export const AMBER = "#b45309"; // on-track (slightly behind, within tolerance)
export const RED = "#b91c1c"; // at-risk / behind pace
export const RED_DEEP = "#7f1d1d"; // overdue (past target date)
export const ROSE = "#9f1239"; // spillover (carried + incomplete)
export const SLATE = "#475569"; // self / neutral
export const BLUE = "#1d4ed8"; // delegated / structural
export const YELLOW = "#ca8a04"; // caution accent (distinct from AMBER)
export const ORANGE = "#c2410c"; // warm accent, e.g. money / secondary measures
export const PURPLE = "#7c3aed"; // structural accent, e.g. cascade coverage
export const TEAL = "#0d9488"; // count accent, e.g. clustered goal-count bars

export const DISPLAY = "var(--font-display), system-ui, sans-serif";

/* ── The 6 pace-derived display bands (deriveHealth + overdue overlay) ─── */
export type DisplayBand = "done" | "ahead" | "on-track" | "at-risk" | "overdue" | "spillover";

export interface BandMeta {
  label: string;
  short: string;
  color: string;
}

export const BAND_META: Record<DisplayBand, BandMeta> = {
  done: { label: "Done", short: "Done", color: GREEN },
  ahead: { label: "Ahead of pace", short: "Ahead", color: GREEN_BRIGHT },
  "on-track": { label: "On track", short: "On track", color: AMBER },
  "at-risk": { label: "At risk", short: "At risk", color: RED },
  overdue: { label: "Overdue", short: "Overdue", color: RED_DEEP },
  spillover: { label: "Spillover", short: "Spillover", color: ROSE },
};

/** Distribution / legend order: best → worst. */
export const BAND_ORDER: DisplayBand[] = [
  "done",
  "ahead",
  "on-track",
  "at-risk",
  "overdue",
  "spillover",
];

/* ── One analysed goal row ─────────────────────────────────────────────── */
export interface Row {
  g: GoalDTO;
  eff: number;
  h: DerivedHealth;
  band: DisplayBand;
  /** whole days past its target date (overdue only), else 0. */
  daysLate: number;
  /** direct cascade children + week cards under this goal. */
  childCount: number;
}

export function classify(g: GoalDTO, now: Date, childCount: number): Row {
  const eff = Math.round(effectiveGoalPct(g));
  const spill = isSpillover(g);
  const h = deriveHealth(eff, g.periodKey, now, { spillover: spill });
  const tds = g.targetDate ? targetDateStatus(g.targetDate) : null;
  const overdue = !!tds && (tds.daysLeft ?? 0) < 0 && eff < 100;
  const daysLate = overdue && tds ? Math.abs(tds.daysLeft ?? 0) : 0;
  let band: DisplayBand;
  if (h.band === "done") band = "done";
  else if (h.band === "spillover") band = "spillover";
  else if (overdue) band = "overdue";
  else band = h.band as DisplayBand; // ahead | on-track | at-risk
  return { g, eff, h, band, daysLate, childCount };
}

/** goalType code → human pillar label (base codes map; custom passes through). */
export function pillarOf(g: GoalDTO): string | null {
  const gt = g.goalType?.trim();
  if (!gt) return null;
  return GOAL_TYPE_LABELS[gt as GoalType] ?? gt;
}

/* ====================================================================== */
/* Model                                                                  */
/* ====================================================================== */

export interface Group {
  label: string;
  count: number;
  pct: number;
}

export interface Model {
  total: number;
  totalWeight: number;
  weighted: number;
  avgExpected: number;
  avgConfidence: number;
  paceDelta: number;
  counts: Record<DisplayBand, number>;
  onPace: number;
  atRisk: number;
  overdue: number;
  done: number;
  needsAttention: number;
  rupee: { target: number; actual: number } | null;
  qty: { target: number; actual: number } | null;
  coverage: { withChildren: number; orphans: Row[]; pct: number } | null;
  byPillar: Group[];
  byArea: Group[];
  accountability: {
    self: number;
    assigned: number;
    delegated: number;
    delegatedWeight: number;
    reviewed: number;
    selfOnly: number;
    avgDep: number;
    maxDep: number;
    depCount: number;
  };
  atRiskRows: Row[];
}

/** Σ actual/target over `rows`' ₹ and quantity measures — a goal only counts
 *  toward a measure when its target is a real positive number, so a goal
 *  with target 0 (or no target) never drags the aggregate toward a
 *  misleading 0%. Shared by `buildModel` and the Actual vs Target panel so
 *  the two can never disagree on what's "measurable." */
export function aggregateMeasures(rows: Row[]): {
  rupee: { target: number; actual: number } | null;
  qty: { target: number; actual: number } | null;
} {
  let rt = 0,
    ra = 0,
    hasR = false;
  let qt = 0,
    qa = 0,
    hasQ = false;
  for (const r of rows) {
    const t = asNum(r.g.targetAmount);
    if (t != null && t > 0) {
      hasR = true;
      rt += t;
      ra += asNum(r.g.actualAmount) ?? 0;
    }
    const tq = asNum(r.g.targetQty);
    if (tq != null && tq > 0) {
      hasQ = true;
      qt += tq;
      qa += asNum(r.g.actualQty) ?? 0;
    }
  }
  return {
    rupee: hasR ? { target: rt, actual: ra } : null,
    qty: hasQ ? { target: qt, actual: qa } : null,
  };
}

export function buildModel(rows: Row[], level: GoalPeriod): Model {
  const total = rows.length;
  const goals = rows.map((r) => r.g);
  const totalWeight = goals.reduce((s, g) => s + (g.weight > 0 ? g.weight : 0), 0);
  const weighted = rollupPct(goals) ?? 0;
  const avgExpected = total ? Math.round(rows.reduce((s, r) => s + r.h.expected, 0) / total) : 0;
  const avgConfidence = total ? Math.round(rows.reduce((s, r) => s + r.h.confidence, 0) / total) : 0;

  const counts: Record<DisplayBand, number> = {
    done: 0,
    ahead: 0,
    "on-track": 0,
    "at-risk": 0,
    overdue: 0,
    spillover: 0,
  };
  for (const r of rows) counts[r.band] += 1;
  const onPace = counts.ahead + counts["on-track"];
  const atRisk = counts["at-risk"] + counts.spillover;
  const overdue = counts.overdue;
  const done = counts.done;
  const needsAttention = counts["at-risk"] + counts.spillover + counts.overdue;

  // ₹ + quantity — Σ over this level's own goals (siblings, no double count).
  const { rupee, qty } = aggregateMeasures(rows);

  // Cascade coverage — only levels that HAVE a child level (not week).
  const coverage =
    level === "week"
      ? null
      : (() => {
          const withChildren = rows.filter((r) => r.childCount > 0).length;
          const orphans = rows
            .filter((r) => r.childCount === 0)
            .sort((a, b) => (b.g.weight || 0) - (a.g.weight || 0));
          return { withChildren, orphans, pct: total ? Math.round((withChildren / total) * 100) : 0 };
        })();

  // By pillar (goalType) + by area — weighted attainment per group.
  const groupBy = (key: (r: Row) => string): Group[] => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()]
      .map(([label, rs]) => ({
        label,
        count: rs.length,
        pct: rollupPct(rs.map((x) => x.g)) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || b.pct - a.pct);
  };
  const byPillar = groupBy((r) => pillarOf(r.g) ?? "Unspecified");
  const byArea = groupBy((r) => (r.g.area?.trim() ? r.g.area.trim() : "Unassigned"));

  // Accountability / delegation.
  let self = 0,
    assigned = 0,
    delegated = 0,
    delegatedWeight = 0,
    reviewed = 0,
    depSum = 0,
    depCount = 0,
    depMax = 0;
  for (const r of rows) {
    if (assignmentInfo(r.g).type === "assigned") assigned += 1;
    else self += 1;
    const dels = r.g.delegatedTo ?? [];
    if (dels.length > 0) {
      delegated += 1;
      delegatedWeight += r.g.weight > 0 ? r.g.weight : 0;
    }
    if (r.g.acceptPct != null) reviewed += 1;
    const dep = r.g.teamDependencyPct;
    if (dep != null && dep > 0) {
      depSum += dep;
      depCount += 1;
      depMax = Math.max(depMax, dep);
    }
  }

  const atRiskRows = rows
    .filter((r) => r.band === "at-risk" || r.band === "overdue" || r.band === "spillover")
    .sort((a, b) => b.daysLate - a.daysLate || a.h.delta - b.h.delta);

  return {
    total,
    totalWeight,
    weighted,
    avgExpected,
    avgConfidence,
    paceDelta: weighted - avgExpected,
    counts,
    onPace,
    atRisk,
    overdue,
    done,
    needsAttention,
    rupee,
    qty,
    coverage,
    byPillar,
    byArea,
    accountability: {
      self,
      assigned,
      delegated,
      delegatedWeight,
      reviewed,
      selfOnly: total - reviewed,
      avgDep: depCount ? Math.round(depSum / depCount) : 0,
      maxDep: depMax,
      depCount,
    },
    atRiskRows,
  };
}

/* ====================================================================== */
/* Yearly performance trend + goal count — per-quarter                    */
/* ====================================================================== */

export interface QuarterPoint {
  /** The real periodKey, e.g. "2026-Q2". */
  key: string;
  /** Short axis label, e.g. "Q1". */
  label: string;
  /** Adopted quarter-goal count for this quarter. */
  count: number;
  /** Weighted attainment for that quarter's adopted goals, or null when the
   *  quarter has no adopted goals yet (never a fabricated 0). */
  actual: number | null;
  /** Average pace-to-date expectation for that quarter's goals. Only
   *  meaningful alongside a non-null `actual` — 0 when there's no data. */
  expected: number;
}

/**
 * One point per quarter of the FY, built from the SAME `classify`/`rollupPct`
 * math the rest of this file uses — no separate trend calculation invented.
 * Backs BOTH the "Goals by Quarter" count chart and the quarterly attainment
 * trend line, so the two charts can never disagree on what a quarter's goal
 * set is. Only meaningful for the Yearly dashboard (quarters are the Yearly
 * view's own child level); callers gate rendering on `level === "year"`.
 */
export function buildQuarterBreakdown(allGoals: GoalDTO[], fyStartYear: number, now: Date): QuarterPoint[] {
  return quartersOfFy(fyStartYear).map((key) => {
    const label = `Q${key.slice(-1)}`;
    const quarterGoals = allGoals.filter((g) => g.period === "quarter" && g.periodKey === key && g.adopted);
    if (quarterGoals.length === 0) return { key, label, count: 0, actual: null, expected: 0 };
    const actual = rollupPct(quarterGoals) ?? 0;
    const expected = Math.round(
      quarterGoals.reduce((s, g) => s + expectedPct(g.periodKey, now), 0) / quarterGoals.length,
    );
    return { key, label, count: quarterGoals.length, actual, expected };
  });
}

/* ====================================================================== */
/* Dashboard filters — the ONE predicate every chart + the goal table     */
/* filter through, so they can never drift out of sync.                  */
/* ====================================================================== */

export interface DashboardFilters {
  area: string[];
  type: string[];
  owner: "all" | "self" | "assigned";
  delegate: string | null;
  status: DisplayBand[];
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  area: [],
  type: [],
  owner: "all",
  delegate: null,
  status: [],
};

export function matchesFilters(g: GoalDTO, band: DisplayBand, f: DashboardFilters): boolean {
  if (f.area.length > 0) {
    const a = g.area?.trim() ? g.area.trim() : "Unassigned";
    if (!f.area.includes(a)) return false;
  }
  if (f.type.length > 0) {
    const t = pillarOf(g) ?? "Unspecified";
    if (!f.type.includes(t)) return false;
  }
  if (f.owner !== "all") {
    const isAssigned = assignmentInfo(g).type === "assigned";
    if (f.owner === "self" && isAssigned) return false;
    if (f.owner === "assigned" && !isAssigned) return false;
  }
  if (f.delegate) {
    const dels = g.delegatedTo ?? [];
    if (!dels.some((d) => d.employeeId === f.delegate)) return false;
  }
  if (f.status.length > 0 && !f.status.includes(band)) return false;
  return true;
}

/* ====================================================================== */
/* Delegation / ownership analytics                                       */
/* ====================================================================== */

export interface DelegatePersonStat {
  employeeId: string;
  name: string;
  goalCount: number;
  weightSum: number;
  /** Average share % this person holds across their delegated goals. */
  avgSharePct: number;
}

export interface DelegationStats {
  /** People with at least one delegated goal — never the full roster. */
  byPerson: DelegatePersonStat[];
  totalWeight: number;
  delegatedWeight: number;
  selfWeight: number;
  delegatedPct: number;
}

/** Aggregates the real `delegatedTo[]` (each entry's own `pct`) across
 *  `rows` — a goal can have MULTIPLE delegates, each counted for their own
 *  share; `delegatedWeight` itself is counted once per goal (not per
 *  delegate) so the self/delegated split never double-counts. */
export function computeDelegationStats(rows: Row[], roster: RosterMember[]): DelegationStats {
  const rosterName = new Map(roster.map((r) => [r.id, r.name]));
  const byPerson = new Map<
    string,
    { name: string; goalCount: number; weightSum: number; pctSum: number; pctCount: number }
  >();
  let totalWeight = 0;
  let delegatedWeight = 0;

  for (const r of rows) {
    const w = r.g.weight > 0 ? r.g.weight : 0;
    totalWeight += w;
    const dels = r.g.delegatedTo ?? [];
    if (dels.length === 0) continue;
    delegatedWeight += w;
    for (const d of dels) {
      const name = d.name ?? rosterName.get(d.employeeId) ?? "Unknown";
      const cur = byPerson.get(d.employeeId) ?? { name, goalCount: 0, weightSum: 0, pctSum: 0, pctCount: 0 };
      cur.goalCount += 1;
      cur.weightSum += w;
      cur.pctSum += d.pct ?? 100;
      cur.pctCount += 1;
      byPerson.set(d.employeeId, cur);
    }
  }

  const list: DelegatePersonStat[] = [...byPerson.entries()]
    .map(([employeeId, v]) => ({
      employeeId,
      name: v.name,
      goalCount: v.goalCount,
      weightSum: v.weightSum,
      avgSharePct: v.pctCount ? Math.round(v.pctSum / v.pctCount) : 100,
    }))
    .sort((a, b) => b.goalCount - a.goalCount || b.weightSum - a.weightSum);

  return {
    byPerson: list,
    totalWeight,
    delegatedWeight,
    selfWeight: Math.max(0, totalWeight - delegatedWeight),
    delegatedPct: totalWeight > 0 ? Math.round((delegatedWeight / totalWeight) * 100) : 0,
  };
}

/* ====================================================================== */
/* Weight concentration insight                                           */
/* ====================================================================== */

export interface WeightConcentration {
  topN: number;
  topPct: number;
}

/** Smallest N such that the top-N heaviest goals cover ≥50% of total
 *  weight (or all of them, if the weight never concentrates that far) —
 *  `null` when there's too little data (<2 weighted goals) to say anything
 *  meaningful about concentration. */
export function computeWeightConcentration(rows: Row[]): WeightConcentration | null {
  const weights = rows
    .map((r) => (r.g.weight > 0 ? r.g.weight : 0))
    .filter((w) => w > 0)
    .sort((a, b) => b - a);
  const total = weights.reduce((s, w) => s + w, 0);
  if (weights.length < 2 || total <= 0) return null;
  let running = 0;
  for (let i = 0; i < weights.length; i++) {
    running += weights[i] ?? 0;
    const pct = Math.round((running / total) * 100);
    if (pct >= 50 || i === weights.length - 1) return { topN: i + 1, topPct: pct };
  }
  return null;
}

/* ====================================================================== */
/* Area × Type matrix                                                     */
/* ====================================================================== */

export interface AreaTypeMatrix {
  areas: string[];
  types: string[];
  /** Keyed `"${area}|${type}"`. */
  cells: Map<string, number>;
  maxCell: number;
}

export function computeAreaTypeMatrix(rows: Row[]): AreaTypeMatrix {
  const areaSet = new Set<string>();
  const typeSet = new Set<string>();
  const cells = new Map<string, number>();
  let maxCell = 0;
  for (const r of rows) {
    const area = r.g.area?.trim() ? r.g.area.trim() : "Unassigned";
    const type = pillarOf(r.g) ?? "Unspecified";
    areaSet.add(area);
    typeSet.add(type);
    const key = `${area}|${type}`;
    const next = (cells.get(key) ?? 0) + 1;
    cells.set(key, next);
    if (next > maxCell) maxCell = next;
  }
  return { areas: [...areaSet].sort(), types: [...typeSet].sort(), cells, maxCell };
}

/* ====================================================================== */
/* Smart insights — dynamic sentences, never hardcoded                    */
/* ====================================================================== */

/** Every sentence here is computed straight from `model`/`rows` — an
 *  insight that doesn't apply (not enough data, nothing notable) is simply
 *  omitted, never replaced with a placeholder or invented number. */
export function buildSmartInsights(model: Model, rows: Row[]): string[] {
  const insights: string[] = [];
  if (model.total === 0) return insights;

  const conc = computeWeightConcentration(rows);
  if (conc) {
    insights.push(
      `${conc.topN} goal${conc.topN === 1 ? "" : "s"} account${conc.topN === 1 ? "s" : ""} for ${conc.topPct}% of total weight.`,
    );
  }

  const top = model.byArea[0];
  if (top) {
    insights.push(`${top.label} has the most goals (${top.count}).`);
  }

  const below50 = rows.filter((r) => r.eff < 50).length;
  if (below50 > 0) {
    insights.push(`${below50} goal${below50 === 1 ? "" : "s"} ${below50 === 1 ? "is" : "are"} below 50% attainment.`);
  }

  const a = model.accountability;
  if (a.self >= a.assigned && a.self >= a.delegated && a.self > 0) {
    insights.push(`Most goals are self-created (${a.self} of ${model.total}).`);
  }
  if (a.delegated > 0) {
    const exposurePct = model.totalWeight > 0 ? Math.round((a.delegatedWeight / model.totalWeight) * 100) : 0;
    insights.push(`Delegation exposure is currently ${exposurePct}%.`);
  }

  if (model.byArea.length > 1) {
    const worst = [...model.byArea].sort((x, y) => x.pct - y.pct)[0];
    if (worst && worst.pct < model.weighted) {
      insights.push(`${worst.label} has the lowest attainment (${worst.pct}%).`);
    }
  }

  return insights.slice(0, 6);
}
