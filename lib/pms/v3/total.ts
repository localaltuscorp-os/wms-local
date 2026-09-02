/**
 * PMS v3 (WS-2) — the CAPSTONE: the overall monthly /100 TOTAL rollup.
 *
 * PURE (no I/O). Sums every factor's EARNED points against the person's active
 * weight band (config-driven, never hardcoded) into a single /100 base score, then
 * adds Manan's X-Factor bonus ON TOP (capped at cfg.xFactorMaxPoints):
 *
 *   incentives   = grade.blockFraction × band["incentives"]            (0 if no CTC/grade)
 *   kpi          = clamp(effectivePct,0,100)/100 × band["kpi"]         (0 if no attainment)
 *   constitution = Σ paras [ (paraWeight/Σweight) × (effScore/scaleMax) ] × band["constitution"]
 *   subjective   = clamp(blendedFinal,0,scaleMax)/scaleMax × band[key]  (per subjective factor)
 *   base   = clamp(Σ earned, 0, 100)
 *   total  = base + clamp(xFactorPoints, 0, xFactorMaxPoints)
 *
 * The subjective `blendedFinal` comes from the read layer's perception blend
 * (non-mgr = manager 50% + Manan 50%; mgr = Manan 100%). KPI uses the EFFECTIVE
 * attainment (Manan overrides the manager). Constitution combines the admin +
 * self per-para scores (see `constitutionAggregate`).
 *
 * `pending=true` whenever the number is NOT the final truth — the weight band is
 * unset (non-manager variant not chosen), or any weighted input is still missing —
 * so the UI can show "in progress" instead of a misleadingly low number.
 */
import { activeBand, type FactorKind, type PmsV3Config } from "./config";
import { incentivePoints, kpiPoints, type GradeResult } from "./grade-band";

/** One Constitution paragraph's inputs for the aggregate (headings excluded upstream or via isHeading). */
export interface ConstitutionParaInput {
  isHeading: boolean;
  /** Admin-distributed weight (share of constitutionTotalWeight). */
  weight: number;
  /** Admin's 0..scaleMax score for this para (authority side). */
  adminScore: number | null;
  /** Subject's self 0..scaleMax score for this para. */
  selfScore: number | null;
}

/** Everything the total needs for one person/month — assembled by the read layer. */
export interface PmsTotalInputs {
  /** Incentive grade (paid ÷ CTC → band). null / band===null ⇒ no CTC ⇒ 0. */
  grade: GradeResult | null;
  /** EFFECTIVE KPI attainment % (Manan's if entered, else the manager's). */
  kpiEffectivePct: number | null;
  /** Constitution paragraphs (with this subject's admin + self scores). */
  constitution: ConstitutionParaInput[];
  /** Blended subjective FINAL per factorKey (same 0..subjectiveScaleMax scale). */
  subjectiveFinals: Record<string, number | null>;
  /** Sum of X-Factor points across the month's rows (pre-cap). */
  xFactorPoints: number;
}

export interface PmsTotalBreakdownRow {
  key: string;
  label: string;
  kind: FactorKind;
  /** The band weight (max points) for this factor. */
  weight: number;
  /** Points earned (0..weight). */
  earned: number;
  /** A short human driver for display (grade letter, %, blended score…). */
  detail: string | null;
  /** Required input for this factor is absent (earned forced to 0). */
  missing: boolean;
}

export interface PmsTotalResult {
  /** Weighted base out of 100 (clamped). Meaningful only when a band exists. */
  base: number;
  /** X-Factor bonus, capped at cfg.xFactorMaxPoints. */
  xFactor: number;
  /** base + xFactor (can exceed 100 — X-Factor is a bonus on top). */
  total: number;
  /** Per-factor earned/weight rows, in band order, + why any are missing. */
  breakdown: PmsTotalBreakdownRow[];
  /** true ⇒ show "in progress", not the number (band unset or inputs missing). */
  pending: boolean;
  /** Human reasons the total is still in progress (for a tooltip / caption). */
  pendingReasons: string[];
  /** false when the non-manager weight band is still pending Sir's ruling. */
  bandResolved: boolean;
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Constitution aggregate → the fraction (0..1) of the Constitution weight block
 * earned. Each scorable para contributes `(paraWeight / Σweight) × (eff/scaleMax)`
 * where `eff` combines the admin + self scores present (mean of whichever exist —
 * "semi-objective", per the spec). Returns `fraction=null` when no weights are set
 * or no paras are scored; `complete=false` when some scorable para is unscored.
 */
export function constitutionAggregate(
  paras: ConstitutionParaInput[],
  cfg: PmsV3Config,
): { fraction: number | null; complete: boolean; scoredCount: number; scorableCount: number } {
  const scorable = paras.filter((p) => !p.isHeading);
  const scale = cfg.constitutionScaleMax > 0 ? cfg.constitutionScaleMax : 10;
  const totalWeight = scorable.reduce((s, p) => s + (Number.isFinite(p.weight) ? p.weight : 0), 0);
  if (scorable.length === 0 || totalWeight <= 0) {
    return { fraction: null, complete: false, scoredCount: 0, scorableCount: scorable.length };
  }
  let acc = 0;
  let scoredCount = 0;
  for (const p of scorable) {
    const present = [p.adminScore, p.selfScore].filter((x): x is number => x != null);
    if (present.length === 0) continue;
    scoredCount += 1;
    const eff = present.reduce((a, b) => a + b, 0) / present.length; // 0..scale
    const w = Number.isFinite(p.weight) ? p.weight : 0;
    acc += (w / totalWeight) * clamp(eff / scale, 0, 1);
  }
  if (scoredCount === 0) {
    return { fraction: null, complete: false, scoredCount: 0, scorableCount: scorable.length };
  }
  return {
    fraction: clamp(acc, 0, 1),
    complete: scoredCount === scorable.length,
    scoredCount,
    scorableCount: scorable.length,
  };
}

/**
 * The overall monthly PMS total for one person. Every weight comes from
 * `activeBand(cfg, isManager)`; a missing input earns 0 and flags `pending` so the
 * UI never shows a misleadingly low "final" number as if it were complete.
 */
export function computePmsTotal(
  inputs: PmsTotalInputs,
  cfg: PmsV3Config,
  isManager: boolean,
): PmsTotalResult {
  const band = activeBand(cfg, isManager);
  const scale = cfg.subjectiveScaleMax > 0 ? cfg.subjectiveScaleMax : 10;
  const xFactor = clamp(inputs.xFactorPoints, 0, cfg.xFactorMaxPoints);
  const defByKey = new Map(cfg.factors.map((f) => [f.key, f] as const));

  // Band still pending Sir's ruling (non-managers): nothing can be weighted.
  if (band == null) {
    return {
      base: 0,
      xFactor,
      total: xFactor,
      breakdown: [],
      pending: true,
      pendingReasons: ["Weight band pending — the non-manager variant has not been chosen yet"],
      bandResolved: false,
    };
  }

  const breakdown: PmsTotalBreakdownRow[] = [];
  const pendingReasons: string[] = [];
  let base = 0;

  for (const [key, rawWeight] of Object.entries(band)) {
    const weight = Number.isFinite(rawWeight) ? rawWeight : 0;
    const def = defByKey.get(key);
    const label = def?.label ?? key;
    const kind: FactorKind = def?.kind ?? "subjective";
    let earned = 0;
    let missing = false;
    let detail: string | null = null;

    if (key === "incentives") {
      if (inputs.grade?.band) {
        earned = incentivePoints(inputs.grade.band, weight);
        const pct = inputs.grade.pctOfCtc;
        detail = `${inputs.grade.band.grade}${pct != null ? ` · ${pct.toFixed(1)}%` : ""}`;
      } else {
        missing = true;
        detail = "no CTC";
        pendingReasons.push("Incentive grade unavailable (monthly CTC not entered)");
      }
    } else if (key === "kpi") {
      if (inputs.kpiEffectivePct != null) {
        earned = kpiPoints(inputs.kpiEffectivePct, weight);
        detail = `${inputs.kpiEffectivePct}%`;
      } else {
        missing = true;
        pendingReasons.push("KPI attainment % not entered");
      }
    } else if (key === "constitution") {
      const c = constitutionAggregate(inputs.constitution, cfg);
      if (c.fraction == null) {
        missing = true;
        pendingReasons.push("Constitution not scored / weights unset");
      } else {
        earned = c.fraction * weight;
        detail = `${(c.fraction * 100).toFixed(0)}%`;
        if (!c.complete) {
          pendingReasons.push(
            `Constitution partially scored (${c.scoredCount}/${c.scorableCount} paras)`,
          );
        }
      }
    } else {
      // Subjective factor — uses the blended final (perception model).
      const final = inputs.subjectiveFinals[key] ?? null;
      if (final != null) {
        earned = clamp(final / scale, 0, 1) * weight;
        detail = final.toFixed(1);
      } else {
        missing = true;
        pendingReasons.push(`${label} not fully scored`);
      }
    }

    base += earned;
    breakdown.push({ key, label, kind, weight, earned, detail, missing });
  }

  base = clamp(base, 0, 100);
  const total = clamp(base + xFactor, 0, 100 + cfg.xFactorMaxPoints);

  return {
    base,
    xFactor,
    total,
    breakdown,
    pending: pendingReasons.length > 0,
    pendingReasons,
    bandResolved: true,
  };
}
