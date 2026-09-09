"use client";

/**
 * Goals Canvas — EXECUTIVE KPI STRIP (Unit 2).
 *
 * Stripe-style band of big numbers derived 100% CLIENT-SIDE from the
 * single-person FY tree the server page already passes (via useCanvasShell).
 * ZERO queries, zero actions — pure math over `goals`.
 *
 * Four cards: Goals adopted · Attainment (weighted effective %) · At risk
 * (pace-derived + spillover, with the blocked/spillover sub-line) ·
 * ₹ achievement (Σ actual_amount vs Σ target_amount over own goals).
 *
 * Health math (blueprint §5, Viva pace rule — fixed 25-pt cut, NO DB columns):
 *   expected  = linear time-elapsed % of the goal's period bounds, clamped 0..100
 *   at-risk   ⇔ (effective − expected) ≤ −25, OR spillover (carried + incomplete)
 *
 * Brand laws: Altus red identity (#E10600/#A80400 + semantic pctTone hexes);
 * brand-red is FORBIDDEN in this directory. tabular-nums on every stat.
 * Count-up + auras are reduced-motion-gated. Sparklines are hand-rolled SVG.
 */

import * as React from "react";
import { useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronDown, Gauge, IndianRupee, Target } from "lucide-react";
import {
  effectiveGoalPct,
  fmtNum,
  fyLabel,
  isSpillover,
  pctTone,
  periodKeyLabel,
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
} from "@/components/goals/cascade/util";
import { monthKeysOfFy } from "@/lib/goals/types";
import { deriveHealth, expectedPct, rollupPct, rupeeRollup } from "@/lib/goals/derive";
import { SEM_GREEN, SEM_RISK } from "./tokens";
import { useCanvasShell } from "./shell-context";
import { resolveAddressedChild, resolveEffectiveFocus } from "./stage";
import type { GoalDTO, ZoomLevel } from "./types";

/* ------------------------------------------------------------------ */
/* Semantic hexes (blueprint §8.1 — the ONLY colors this file may use) */
/* ------------------------------------------------------------------ */

// Semantic hexes come from the design contract (tokens.ts §2.0 — no local copies).
const GREEN = SEM_GREEN; // healthy / on-pace
const RISK_RED = SEM_RISK; // semantic at-risk/spillover red (NOT brand red)

/* ------------------------------------------------------------------ */
/* Pace math — CANONICAL, lib/goals/derive.ts (§3.1; no local copies)  */
/* ------------------------------------------------------------------ */

/** True iff the goal is behind the fixed 25-pt pace cut OR is a spillover. */
function isAtRisk(g: GoalDTO, now: Date): boolean {
  return deriveHealth(effectiveGoalPct(g), g.periodKey, now, { spillover: isSpillover(g) }).atRisk;
}

/* ------------------------------------------------------------------ */
/* KPI derivation over the loaded tree                                 */
/* ------------------------------------------------------------------ */

interface KpiData {
  /** Human label of the current scope ("FY 2026–27" or the focused bucket). */
  scopeLabel: string;
  totalInScope: number;
  adoptedCount: number;
  /** Weight-normalized average effective % over adopted goals in scope. */
  weightedPct: number;
  /** weightedPct − expected pace of the scope period (negative = behind). */
  paceDelta: number;
  /** At-risk = behind-pace OR spillover (spillover always counts). */
  atRiskCount: number;
  /** Blocked = spillover-derived (carried forward + still incomplete). */
  blockedCount: number;
  /** Σ target_amount / Σ actual_amount over own goals; null when no ₹ targets. */
  rupee: { target: number; actual: number } | null;
  /** 12-point Apr..Mar month-bucket series for the sparklines (FY-wide). */
  series: { pct: number[]; atRisk: number[] };
}

function computeKpis(
  goals: GoalDTO[],
  focusedGoal: GoalDTO | null,
  fyStartYear: number,
  now: Date,
): KpiData {
  // ROOT-only rollups (bug #6): the cascade writes the SAME money + progress at
  // every level, so flat-summing/averaging/counting the whole subtree double-
  // or triple-counts — ONE ₹1Cr objective divided Y→Q→M read "of ₹3Cr" and
  // "17 adopted". Every card scopes to the ROOT objectives (the focused goal,
  // or every parentless root FY-wide) and lets rupeeRollup/rollupPct descend
  // only until the first level that carries a value (derive.ts §3.1, the
  // module's own no-double-count law).
  const childrenOf = new Map<string, GoalDTO[]>();
  for (const g of goals) {
    if (g.parentGoalId == null) continue;
    const bucket = childrenOf.get(g.parentGoalId);
    if (bucket) bucket.push(g);
    else childrenOf.set(g.parentGoalId, [g]);
  }
  const rootsInScope = focusedGoal
    ? [focusedGoal]
    : goals.filter((g) => g.parentGoalId == null);
  const adopted = rootsInScope.filter((g) => g.adopted);

  let atRiskCount = 0;
  let blockedCount = 0;
  for (const g of adopted) {
    if (isAtRisk(g, now)) atRiskCount += 1;
    if (isSpillover(g)) blockedCount += 1;
  }

  // Canonical weighted rollup (derive.ts §3.1) over the scope's roots only.
  const weightedPct = rollupPct(rootsInScope) ?? 0;

  const scopeKey = focusedGoal ? focusedGoal.periodKey : String(fyStartYear);
  const paceDelta = weightedPct - expectedPct(scopeKey, now);

  let target = 0;
  let actual = 0;
  let hasTarget = false;
  for (const root of rootsInScope) {
    const r = rupeeRollup(root, (n) => childrenOf.get(n.id) ?? []);
    if (!r) continue;
    hasTarget = true;
    target += r.target;
    actual += r.actual;
  }

  const monthKeys = monthKeysOfFy(fyStartYear);
  const pctSeries: number[] = [];
  const riskSeries: number[] = [];
  for (const key of monthKeys) {
    const bucket = goals.filter((g) => g.adopted && g.periodKey === key);
    pctSeries.push(
      bucket.length > 0
        ? Math.round(bucket.reduce((sum, g) => sum + effectiveGoalPct(g), 0) / bucket.length)
        : 0,
    );
    riskSeries.push(bucket.reduce((count, g) => count + (isAtRisk(g, now) ? 1 : 0), 0));
  }

  return {
    scopeLabel: focusedGoal ? periodKeyLabel(focusedGoal.periodKey) : fyLabel(fyStartYear),
    totalInScope: rootsInScope.length,
    adoptedCount: adopted.length,
    weightedPct,
    paceDelta,
    atRiskCount,
    blockedCount,
    rupee: hasTarget ? { target, actual } : null,
    series: { pct: pctSeries, atRisk: riskSeries },
  };
}

/* ------------------------------------------------------------------ */
/* Subtle count-up (rAF, ease-out cubic; renders final state when      */
/* reduced motion is requested)                                        */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, animate: boolean): number {
  const [shown, setShown] = React.useState(() => (animate ? 0 : target));
  const fromRef = React.useRef(animate ? 0 : target);

  React.useEffect(() => {
    if (!animate) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const started = performance.now();
    const duration = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - started) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, animate]);

  return shown;
}

/* ------------------------------------------------------------------ */
/* Hand-rolled 60×24 sparkline (no chart libs)                         */
/* ------------------------------------------------------------------ */

function Sparkline(props: { values: number[]; label: string }) {
  const { values, label } = props;
  const W = 60;
  const H = 24;
  const PAD = 2;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = PAD + i * step;
      const y = H - PAD - (Math.max(0, v) / max) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1] ?? 0;
  const lastX = PAD + (values.length - 1) * step;
  const lastY = H - PAD - (Math.max(0, last) / max) * (H - PAD * 2);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={GOALS_ACCENT}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={GOALS_ACCENT} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* One KPI card                                                        */
/* ------------------------------------------------------------------ */

interface KpiCardSpec {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Already-formatted big number (count-up applied by the caller). */
  big: string;
  bigColor?: string;
  sub: React.ReactNode;
  spark?: { values: number[]; label: string };
  /** "primary" | "secondary" aurora wash; undefined = plain card. */
  aurora?: "primary" | "secondary";
}

function KpiCard(props: { spec: KpiCardSpec; index: number }) {
  const { spec, index } = props;
  const Icon = spec.icon;
  const style: React.CSSProperties = {
    borderColor: "var(--color-hairline)",
    background: "var(--color-surface-card)",
    animationDelay: `${index * 60}ms`,
    minHeight: 96,
    ...(spec.aurora === "primary"
      ? {
          ["--kpi-tone" as string]: `color-mix(in srgb, ${GOALS_ACCENT} 62%, transparent)`,
          ["--kpi-index" as string]: String(index),
        }
      : {}),
    ...(spec.aurora === "secondary"
      ? { ["--kpi-tone-deep" as string]: `color-mix(in srgb, ${GOALS_ACCENT_DEEP} 48%, transparent)` }
      : {}),
  };

  return (
    <article className="wg-rise wg-sheen relative overflow-hidden rounded-2xl border px-5 py-4" style={style}>
      {spec.aurora === "primary" ? <span aria-hidden className="kpi-aurora-primary" /> : null}
      {spec.aurora === "secondary" ? <span aria-hidden className="kpi-aurora-secondary" /> : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            {spec.label}
          </div>
          <div
            className="mt-1 truncate tabular-nums"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: spec.bigColor ?? "var(--color-ink-strong, #0f172a)",
            }}
          >
            {spec.big}
          </div>
          <div className="mt-1 text-[12px] font-semibold tabular-nums text-ink-subtle">{spec.sub}</div>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch">
          <span
            className="grid size-9 place-items-center rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`,
              boxShadow: `0 6px 14px -6px color-mix(in srgb, ${GOALS_ACCENT_DEEP} 55%, transparent)`,
            }}
          >
            <Icon className="size-4 text-white" strokeWidth={2.5} />
          </span>
          {spec.spark ? <Sparkline values={spec.spark.values} label={spec.spark.label} /> : null}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* The strip                                                           */
/* ------------------------------------------------------------------ */

export interface KpiStripProps {
  /** Optional focus override (a goal id). Defaults to the shell's zoom focus. */
  focus?: string | null;
  /** Accepted for contract parity with the blueprint call-site; the KPI math
   *  scopes by the focused goal's subtree, so `z` carries no extra scoping. */
  z?: ZoomLevel;
}

/** Collapse persistence — the strip now renders for EVERYONE (the Exec/Ops
 *  split is gone), so people who want a lean canvas can fold it to one line.
 *  Stored value applies after mount (SSR + first client render share the
 *  default-open state — no hydration mismatch). */
const KPI_OPEN_KEY = "goals-canvas.kpi-open";

/**
 * KPI scorecard strip for the Goals Canvas. Renders four brand-token cards —
 * Goals adopted, Attainment, At risk, ₹ achievement — computed client-side
 * from the already-loaded FY tree. Zero queries, zero server actions.
 * Collapsible (chevron) to a one-line summary; default open.
 */
export function KpiStrip(props: KpiStripProps = {}): React.JSX.Element {
  const shell = useCanvasShell();
  const reduce = useReducedMotion() ?? false;

  const [open, setOpen] = React.useState(true);
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(KPI_OPEN_KEY) === "0") setOpen(false);
    } catch {
      /* storage unavailable (private mode) — stay open */
    }
  }, []);
  const toggleOpen = React.useCallback(() => {
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(KPI_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  // `now` is stamped once per payload so SSR/client renders stay consistent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => new Date(), [shell.goals]);

  // Resolve the scope: an explicit focus prop wins; else the SHARED effective
  // focus (bug #5) so the KPI band scopes to the SAME bucket the panels render.
  const focusedGoal = React.useMemo<GoalDTO | null>(() => {
    if (props.focus === null) return null;
    if (props.focus !== undefined) {
      return shell.goals.find((g) => g.id === props.focus) ?? null;
    }
    return (
      // ?q front door — a quarter-addressed deep link (?pk carrying a quarter
      // key at year zoom) scopes the scorecard to THAT quarter's goal.
      resolveAddressedChild(shell.goals, shell.zoom.z, shell.zoom.pk) ??
      resolveEffectiveFocus({
        goals: shell.goals,
        z: shell.zoom.z,
        wk: shell.zoom.wk,
        pk: shell.zoom.pk, // bug #14 — the clicked goal-less bucket wins over "now"
        focusedGoal: shell.zoom.focusedGoal,
        fyStartYear: shell.fyStartYear,
        now,
      })
    );
  }, [props.focus, shell.goals, shell.zoom.z, shell.zoom.wk, shell.zoom.pk, shell.zoom.focusedGoal, shell.fyStartYear, now]);

  // KPIs react to BOTH the zoom focus (subtree scoping) and the toolbar
  // filter (the shell pre-applies the active predicate → filteredGoals).
  const kpi = React.useMemo(
    () => computeKpis(shell.filteredGoals, focusedGoal, shell.fyStartYear, now),
    [shell.filteredGoals, focusedGoal, shell.fyStartYear, now],
  );

  const animate = !reduce;
  const adoptedShown = Math.round(useCountUp(kpi.adoptedCount, animate));
  const pctShown = Math.round(useCountUp(kpi.weightedPct, animate));
  const riskShown = Math.round(useCountUp(kpi.atRiskCount, animate));
  const rupeeShown = useCountUp(kpi.rupee?.actual ?? 0, animate);

  const attainTone = pctTone(kpi.weightedPct);
  const behind = kpi.paceDelta < 0;
  const paceColor = !behind ? GREEN : kpi.paceDelta <= -25 ? RISK_RED : GOALS_ACCENT;

  const rupeePct =
    kpi.rupee && kpi.rupee.target > 0 ? Math.round((kpi.rupee.actual / kpi.rupee.target) * 100) : null;

  const cards: KpiCardSpec[] = [
    {
      key: "adopted",
      label: "Goals adopted",
      icon: Target,
      big: String(adoptedShown),
      sub:
        kpi.totalInScope > kpi.adoptedCount
          ? `of ${kpi.totalInScope} total · ${kpi.scopeLabel}`
          : kpi.scopeLabel,
      aurora: "primary",
    },
    {
      key: "attainment",
      label: "Attainment",
      icon: Gauge,
      big: `${pctShown}%`,
      bigColor: attainTone.color,
      sub:
        kpi.adoptedCount === 0 ? (
          "no adopted goals yet"
        ) : (
          <span style={{ color: paceColor }}>
            {behind ? "▼" : "▲"} {Math.abs(kpi.paceDelta)} pts {behind ? "behind" : "ahead of"} pace
          </span>
        ),
      spark: { values: kpi.series.pct, label: "Monthly attainment, Apr to Mar" },
      aurora: "secondary",
    },
    {
      key: "at-risk",
      label: "At risk",
      icon: AlertTriangle,
      big: String(riskShown),
      bigColor: kpi.atRiskCount > 0 ? RISK_RED : GREEN,
      sub:
        // bug #24 — never render the "0 blocked · spillover" nonsense: name the
        // spillover count only when it exists, else the honest pace reason.
        kpi.atRiskCount > 0 ? (
          <span style={{ color: RISK_RED }}>
            {kpi.blockedCount > 0
              ? `▼ ${kpi.blockedCount} blocked · spillover`
              : "▼ behind pace"}
          </span>
        ) : (
          <span style={{ color: GREEN }}>▲ all on pace</span>
        ),
      spark: { values: kpi.series.atRisk, label: "Monthly at-risk count, Apr to Mar" },
    },
    {
      key: "rupee",
      label: "₹ achievement",
      icon: IndianRupee,
      big: kpi.rupee ? `₹${fmtNum(rupeeShown)}` : "—",
      bigColor: kpi.rupee ? undefined : "var(--color-ink-subtle)",
      sub: kpi.rupee ? (
        <span>
          {rupeePct != null ? (
            <span style={{ color: rupeePct >= 100 ? GREEN : GOALS_ACCENT }}>
              {rupeePct >= 100 ? "▲" : "▼"} {rupeePct}%
            </span>
          ) : null}{" "}
          of ₹{fmtNum(kpi.rupee.target)} · own goals
        </span>
      ) : (
        "no ₹ targets"
      ),
    },
  ];

  return (
    <section aria-label="Key goal metrics" className="flex flex-col gap-2">
      {/* Header line — scope label · (collapsed) one-line summary · chevron. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Scorecard · {kpi.scopeLabel}
        </span>
        {!open && (
          // One-line variant — raw kpi values (no count-up theatrics folded away).
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold tabular-nums text-ink-muted">
            <span>{kpi.adoptedCount} adopted</span>
            <span style={{ color: attainTone.color }}>{Math.round(kpi.weightedPct)}% attainment</span>
            <span style={{ color: kpi.atRiskCount > 0 ? RISK_RED : GREEN }}>
              {kpi.atRiskCount} at risk
            </span>
            {kpi.rupee && (
              <span className="max-sm:hidden">
                ₹{fmtNum(kpi.rupee.actual)} of ₹{fmtNum(kpi.rupee.target)}
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={open ? "Collapse the scorecard" : "Expand the scorecard"}
          title={open ? "Collapse to one line" : "Expand the scorecard"}
          className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-ink-subtle transition-colors hover:text-ink-strong"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
        >
          <ChevronDown
            size={14}
            strokeWidth={2.6}
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {cards.map((spec, i) => (
            <KpiCard key={spec.key} spec={spec} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
