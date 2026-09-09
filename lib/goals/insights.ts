import "server-only";

/**
 * Goals canvas Phase 8 — the AI INSIGHT worker (design §4.4 item 7 + §5).
 *
 * Generates the cached `goal_ai_insights` row for ONE cascade goal:
 *   · narrative   — one-line health read for the LEFT panel (§2.2 "AI insight
 *                   line"), grounded ONLY in the deterministic facts below.
 *   · suggestions — execution suggestions for the child planners.
 *   · workload    — workload-balancing flags. These are ALWAYS deterministic
 *                   math (never model prose): over/under allocation via
 *                   `allocation`, rebalance amounts via `suggestDistribution`
 *                   (REUSED from lib/goals/derive — the same largest-remainder
 *                   engine the Phase-2 Rebalance banner applies), outlier-load
 *                   detection over the measured children's target shares.
 *
 * RUNTIME CONTRACT (§4.4: "generated async via the afterResponse
 * fire-and-forget pattern; never on the read path"):
 *   - `refreshGoalInsights` is ONLY ever scheduled through `afterResponse`
 *     (lib/after.ts) from the lazy insight-actions read — it runs after the
 *     response has flushed, so it never blocks a render, and page loads never
 *     wait on a model call. Reads only SELECT the cache.
 *   - It NEVER throws: every leg (including the 0143-unapplied case) is
 *     swallowed — a failed refresh just leaves the cache as-is.
 *
 * PROVIDER — per the repo's precedent (lib/ai/attendance-insights.ts): REUSES
 * the existing Gemini client (lib/ai/gemini.ts → generateText, key
 * GEMINI_API_KEY, model GEMINI_MODEL default gemini-2.5-flash) — the only LLM
 * client in this codebase; no second provider, no hardcoded key. Missing key
 * or any model failure degrades to a DETERMINISTIC heuristic (`source:
 * 'heuristic'`) so the panel is never blank and never lies about its origin.
 *
 * SCOPE — the facts derive ONLY from the goal's own subtree (the owner's
 * goals/weekly rows); nothing about peers or unrelated downlines can enter
 * the prompt or the cache. WHO may read the cache is enforced at the action
 * layer with the same viewer-scope authorizeRead as the Phase-7 bundle.
 *
 * LOCKED DECISIONS respected: rollup here is a labeled projection input to
 * prose — nothing is ever written to pctDone/acceptPct (decision 1); weekly
 * pctDone is treated as the manual self-rating it is (decision 2); free-text
 * weekly targets are "unmeasured" and excluded from numeric math (decision 3).
 */

import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goalAiInsights, goals, weeklyGoals } from "@/db/schema";
import { generateText } from "@/lib/ai/gemini";
import { goalsCanvasOn } from "@/lib/goals/flag";
import {
  allocation,
  deriveHealth,
  effective,
  isUnmeasured,
  numericTarget,
  periodBounds,
  rollupPct,
  round2,
  suggestDistribution,
  type AllocationChild,
} from "@/lib/goals/derive";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export type WorkloadFlagKind =
  | "over_allocation"
  | "under_allocation"
  | "outlier_load"
  | "unmeasured_children"
  | "spillover"
  | "stalled";

export interface WorkloadFlag {
  kind: WorkloadFlagKind;
  message: string;
}

export interface GoalInsight {
  narrative: string;
  suggestions: string[];
  workload: WorkloadFlag[];
  source: "ai" | "heuristic";
}

/** Regenerate at most this often for an unchanged input hash. */
const FRESH_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Deterministic facts (the ONLY thing the model ever sees)            */
/* ------------------------------------------------------------------ */

interface ChildFact extends AllocationChild {
  title: string;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  actual: number | null;
}

interface Facts {
  title: string;
  period: string;
  periodKey: string;
  uom: string | null;
  effectivePct: number;
  expectedPct: number;
  deltaPts: number;
  band: string;
  daysLeft: number;
  spillover: boolean;
  /** Weighted child rollup — a labeled projection (decision 1), or null. */
  rollupPct: number | null;
  parentTarget: number | null;
  childLevel: "quarter" | "month" | "week";
  children: ChildFact[];
  allocationState: "exact" | "over" | "under" | null;
  allocationSum: number | null;
  allocationDelta: number | null;
  unmeasuredCount: number;
}

function daysLeftOf(periodKey: string, now: Date): number {
  const { end } = periodBounds(periodKey);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}

/** Stable sha1 over the numeric facts — the regeneration skip key. */
function factsHash(f: Facts): string {
  const basis = JSON.stringify({
    e: f.effectivePct,
    x: f.expectedPct,
    b: f.band,
    d: f.daysLeft,
    r: f.rollupPct,
    t: f.parentTarget,
    a: [f.allocationState, f.allocationSum, f.allocationDelta],
    u: f.unmeasuredCount,
    c: f.children.map((c) => [c.id, numericTarget(c), c.actual, effective(c), c.weight, c.adopted]),
  });
  return createHash("sha1").update(basis).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Workload flags — pure deterministic math (derive.ts reuse)          */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string => {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

function workloadFlags(f: Facts): WorkloadFlag[] {
  const flags: WorkloadFlag[] = [];

  // Over/under allocation + the concrete largest-remainder rebalance — the
  // SAME suggestDistribution the Phase-2 Rebalance banner applies (§3.2.4).
  if (f.allocationState === "over" || f.allocationState === "under") {
    const dist = suggestDistribution(f.children, f.parentTarget ?? 0);
    const movers = f.children
      .filter((c) => c.adopted && !isUnmeasured(c) && dist.has(c.id))
      .map((c) => ({ title: c.title, from: numericTarget(c) ?? 0, to: dist.get(c.id)! }))
      .filter((m) => Math.abs(m.to - m.from) >= 0.01)
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
      .slice(0, 2);
    const moverTxt = movers
      .map((m) => `${m.title} ${fmt(m.from)}→${fmt(m.to)}`)
      .join(", ");
    flags.push({
      kind: f.allocationState === "over" ? "over_allocation" : "under_allocation",
      message:
        `${f.childLevel === "week" ? "Week" : "Child"} targets total ${fmt(f.allocationSum ?? 0)} — ` +
        `${f.allocationState} the target by ${fmt(Math.abs(f.allocationDelta ?? 0))}` +
        (moverTxt ? `. Rebalance: ${moverTxt}` : ""),
    });
  }

  // Outlier load: one measured child carries ≥2× the even share.
  const measured = f.children.filter((c) => c.adopted && !isUnmeasured(c));
  if (measured.length >= 3) {
    const sum = measured.reduce((s, c) => s + (numericTarget(c) ?? 0), 0);
    if (sum > 0) {
      const even = sum / measured.length;
      const top = measured.reduce((a, b) =>
        (numericTarget(a) ?? 0) >= (numericTarget(b) ?? 0) ? a : b,
      );
      const topT = numericTarget(top) ?? 0;
      if (topT >= even * 2) {
        flags.push({
          kind: "outlier_load",
          message: `"${top.title}" carries ${Math.round((topT / sum) * 100)}% of the load — ${measured.length - 1} siblings share the rest`,
        });
      }
    }
  }

  if (f.unmeasuredCount > 0) {
    flags.push({
      kind: "unmeasured_children",
      message: `${f.unmeasuredCount} ${f.childLevel} goal${f.unmeasuredCount === 1 ? " has" : "s have"} no numeric target — excluded from the rollup math`,
    });
  }

  if (f.spillover) {
    flags.push({ kind: "spillover", message: "Carried forward from an earlier period and still open" });
  }

  if (f.effectivePct === 0 && f.expectedPct >= 25 && f.band !== "done") {
    flags.push({
      kind: "stalled",
      message: `No recorded progress with ${f.expectedPct}% of the period elapsed`,
    });
  }

  return flags;
}

/* ------------------------------------------------------------------ */
/* Heuristic fallback — deterministic, always available                 */
/* ------------------------------------------------------------------ */

function heuristicInsight(f: Facts, flags: WorkloadFlag[]): GoalInsight {
  const narrative =
    f.band === "done"
      ? `Complete — ${f.title} closed at ${f.effectivePct}%.`
      : f.band === "spillover"
        ? `Spillover — carried forward and still at ${f.effectivePct}% with ${f.daysLeft} days left.`
        : f.deltaPts >= 0
          ? `${f.deltaPts === 0 ? "Exactly on" : `${f.deltaPts} pts ahead of`} pace at ${f.effectivePct}% with ${f.daysLeft} days left.`
          : `${Math.abs(f.deltaPts)} pts behind pace at ${f.effectivePct}% — ${f.daysLeft} days left to close the gap.`;

  const suggestions: string[] = [];
  if (f.band === "at-risk" || f.band === "spillover") {
    const worst = f.children
      .filter((c) => c.adopted)
      .sort((a, b) => effective(a) - effective(b))[0];
    suggestions.push(
      worst
        ? `Front-load "${worst.title}" — the furthest-behind ${f.childLevel} at ${effective(worst)}%.`
        : `Record where progress actually stands, then plan the remaining ${f.daysLeft} days.`,
    );
  }
  if (f.allocationState === "over" || f.allocationState === "under") {
    suggestions.push(`Targets don't sum to the ${f.period} target — apply the rebalance suggestion.`);
  }
  if (f.unmeasuredCount > 0) {
    suggestions.push(`Give the ${f.unmeasuredCount} unmeasured ${f.childLevel} goal${f.unmeasuredCount === 1 ? "" : "s"} a numeric target.`);
  }
  if (f.effectivePct === 0 && f.expectedPct >= 25 && f.band !== "done") {
    suggestions.push("Log a first progress % so the health read is honest.");
  }
  if (f.band === "ahead" && f.deltaPts >= 15) {
    suggestions.push("Well ahead — consider pulling next period's work forward.");
  }
  if (
    f.rollupPct != null &&
    Math.abs(f.rollupPct - f.effectivePct) >= 20 &&
    f.band !== "done"
  ) {
    suggestions.push(
      `Child rollup projects ${f.rollupPct}% vs ${f.effectivePct}% recorded — reconcile the self-rating.`,
    );
  }

  return { narrative, suggestions: suggestions.slice(0, 5), workload: flags, source: "heuristic" };
}

/* ------------------------------------------------------------------ */
/* Model generation — numbers in, prose out, JSON-only                 */
/* ------------------------------------------------------------------ */

function buildPrompt(f: Facts, flags: WorkloadFlag[]): string {
  const childLines = f.children
    .slice(0, 12)
    .map((c) => {
      const t = numericTarget(c);
      return `- ${c.title}: ${effective(c)}% done` +
        (t != null ? `, target ${fmt(t)}${c.actual != null ? `, actual ${fmt(c.actual)}` : ""}` : ", unmeasured") +
        (c.adopted ? "" : " (dropped)");
    })
    .join("\n");
  return `You are an execution coach writing a short, factual read-out for one business goal. Base EVERY statement only on the numbers given — never invent figures, never moralize, be concrete.

Goal: ${f.title} (${f.period} ${f.periodKey}${f.uom ? `, measured in ${f.uom}` : ""})
Progress: ${f.effectivePct}% recorded vs ${f.expectedPct}% expected by elapsed time (${f.deltaPts >= 0 ? "+" : ""}${f.deltaPts} pts, band: ${f.band}); ${f.daysLeft} days left.${f.rollupPct != null ? `\nChild rollup projection: ${f.rollupPct}% (display-only projection — the recorded % above is the number of record).` : ""}${f.parentTarget != null ? `\nGoal target: ${fmt(f.parentTarget)}.` : ""}${f.allocationState && f.allocationState !== "exact" ? `\nAllocation: ${f.childLevel} targets sum to ${fmt(f.allocationSum ?? 0)} — ${f.allocationState} by ${fmt(Math.abs(f.allocationDelta ?? 0))}.` : ""}
${f.childLevel} goals under it:
${childLines || "- none yet"}
${flags.length ? `Deterministic flags already shown to the user:\n${flags.map((w) => `- ${w.message}`).join("\n")}` : ""}

Return ONLY a JSON object, no prose around it, exactly this shape:
{"narrative": "one sentence health read", "suggestions": ["short execution step", "..."]}
Rules: narrative <= 22 words; 1-4 suggestions, each <= 16 words, imperative, specific to the numbers above; do not repeat the deterministic flags verbatim; if genuinely nothing to suggest, return an empty suggestions array.`;
}

function parseModelJson(text: string): { narrative: string; suggestions: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const narrative = typeof o.narrative === "string" ? o.narrative.trim() : "";
  const suggestions = Array.isArray(o.suggestions)
    ? o.suggestions
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if (!narrative) return null;
  return { narrative, suggestions };
}

/* ------------------------------------------------------------------ */
/* Facts loading — 2 bounded selects, explicit columns                 */
/* ------------------------------------------------------------------ */

const GOAL_FACT_COLS = {
  id: goals.id,
  employeeId: goals.employeeId,
  period: goals.period,
  periodKey: goals.periodKey,
  title: goals.title,
  uom: goals.uom,
  targetQty: goals.targetQty,
  actualQty: goals.actualQty,
  targetAmount: goals.targetAmount,
  actualAmount: goals.actualAmount,
  pctDone: goals.pctDone,
  acceptPct: goals.acceptPct,
  weight: goals.weight,
  adopted: goals.adopted,
  clonedFromId: goals.clonedFromId,
  archived: goals.archived,
} as const;

type GoalFactRow = {
  id: string;
  employeeId: string;
  period: string;
  periodKey: string;
  title: string;
  uom: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  adopted: boolean;
  clonedFromId: string | null;
  archived: boolean;
};

function toChildFact(r: {
  id: string;
  title: string;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  pctDone: number;
  acceptPct: number | null;
  weight: number;
  adopted: boolean;
}): ChildFact {
  const qtyBasis = r.targetQty != null && Number(r.targetQty) > 0;
  const actualRaw = qtyBasis ? r.actualQty : r.actualAmount;
  const actual = actualRaw != null && actualRaw !== "" ? Number(actualRaw) : null;
  return {
    id: r.id,
    title: r.title,
    targetQty: r.targetQty,
    targetAmount: r.targetAmount,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    weight: r.weight,
    adopted: r.adopted,
    actual: actual != null && Number.isFinite(actual) ? actual : null,
  };
}

async function loadFacts(goalId: string, now: Date): Promise<Facts | null> {
  const [node] = await db.select(GOAL_FACT_COLS).from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!node || (node as GoalFactRow).archived) return null;
  const g = node as GoalFactRow;

  let children: ChildFact[];
  let childLevel: Facts["childLevel"];
  if (g.period === "month") {
    // The month's leaves live on weekly_goals (mig 0131 monthGoalId).
    childLevel = "week";
    const rows = await db
      .select({
        id: weeklyGoals.id,
        title: weeklyGoals.targetDone,
        subject: weeklyGoals.subject,
        targetQty: weeklyGoals.targetQty,
        actualQty: weeklyGoals.actualQty,
        targetAmount: weeklyGoals.targetAmount,
        actualAmount: weeklyGoals.actualAmount,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        weight: weeklyGoals.weight,
        adopted: weeklyGoals.adopted,
      })
      .from(weeklyGoals)
      .where(eq(weeklyGoals.monthGoalId, g.id))
      .orderBy(asc(weeklyGoals.weekStart))
      .limit(40);
    children = rows.map((r) =>
      toChildFact({ ...r, title: (r.title ?? r.subject ?? "Weekly goal").slice(0, 80) }),
    );
  } else {
    childLevel = g.period === "year" ? "quarter" : "month";
    const rows = await db
      .select(GOAL_FACT_COLS)
      .from(goals)
      .where(and(eq(goals.parentGoalId, g.id), eq(goals.archived, false)))
      .orderBy(asc(goals.periodKey), asc(goals.position))
      .limit(40);
    children = (rows as GoalFactRow[]).map((r) => toChildFact({ ...r, title: r.title.slice(0, 80) }));
  }

  const eff = effective(g);
  const spillover = g.clonedFromId != null && eff < 100;
  const h = deriveHealth(eff, g.periodKey, now, { spillover });
  const parentTarget = numericTarget(g);
  const alloc = allocation(children, parentTarget);

  return {
    title: g.title,
    period: g.period,
    periodKey: g.periodKey,
    uom: g.uom,
    effectivePct: h.effective,
    expectedPct: h.expected,
    deltaPts: h.delta,
    band: h.band,
    daysLeft: daysLeftOf(g.periodKey, now),
    spillover,
    rollupPct: rollupPct(children),
    parentTarget,
    childLevel,
    children,
    allocationState: alloc?.state ?? null,
    allocationSum: alloc?.sum ?? null,
    allocationDelta: alloc?.delta ?? null,
    unmeasuredCount: children.filter((c) => c.adopted && isUnmeasured(c)).length,
  };
}

/* ------------------------------------------------------------------ */
/* The fire-and-forget worker                                          */
/* ------------------------------------------------------------------ */

/**
 * Refresh the cached insight for one cascade goal. NEVER throws; NEVER runs
 * on a read path — schedule it only via `afterResponse` (lib/after.ts).
 * Skips when the flag is off, the facts hash is unchanged and fresh (<24h),
 * or migration 0143 is unapplied (every table touch is guarded).
 */
export async function refreshGoalInsights(goalId: string, force = false): Promise<void> {
  try {
    if (!goalsCanvasOn()) return;

    const now = new Date();
    const facts = await loadFacts(goalId, now);
    if (!facts) return;
    const hash = factsHash(facts);

    // Cached-row read is the first 0143-guarded touch — unapplied ⇒ bail.
    let existing: { id: string; inputHash: string; generatedAt: Date } | null = null;
    try {
      const [row] = await db
        .select({
          id: goalAiInsights.id,
          inputHash: goalAiInsights.inputHash,
          generatedAt: goalAiInsights.generatedAt,
        })
        .from(goalAiInsights)
        .where(eq(goalAiInsights.goalId, goalId))
        .limit(1);
      existing = row ?? null;
    } catch {
      return; // migration 0143 not applied — silently no-op
    }

    if (
      !force &&
      existing &&
      existing.inputHash === hash &&
      now.getTime() - existing.generatedAt.getTime() < FRESH_MS
    ) {
      return; // unchanged + fresh
    }

    const flags = workloadFlags(facts);

    // Try the model; ANY failure (missing GEMINI_API_KEY, timeout, junk
    // output) degrades to the deterministic heuristic — never blank.
    let insight: GoalInsight;
    let model: string | null = null;
    try {
      const text = await generateText(buildPrompt(facts, flags));
      const parsed = parseModelJson(text);
      insight = parsed
        ? { ...parsed, workload: flags, source: "ai" }
        : heuristicInsight(facts, flags);
      if (parsed) model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    } catch {
      insight = heuristicInsight(facts, flags);
    }

    const values = {
      narrative: insight.narrative,
      suggestions: insight.suggestions,
      workload: insight.workload,
      source: insight.source,
      model,
      inputHash: hash,
      generatedAt: new Date(),
    };

    try {
      if (existing) {
        await db.update(goalAiInsights).set(values).where(eq(goalAiInsights.id, existing.id));
      } else {
        // A concurrent refresh may have inserted first — the unique index
        // rejects the duplicate and the catch below absorbs it (harmless).
        await db.insert(goalAiInsights).values({ goalId, ...values });
      }
    } catch {
      /* 0143 unapplied or a benign concurrent-insert race — leave cache as-is */
    }
  } catch {
    /* NEVER let a background refresh surface an error */
  }
}
