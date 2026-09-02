/**
 * PMS v3 (WS-2) — the PURE incentive → grade-band engine.
 *
 * Grade = f(incentive PAID ÷ monthly CTC), PAID-only, as a % of monthly CTC:
 *   0% = Fail · 0–5% = D · 5–10% = C · 10–15% = B · 15–20% = A.
 * Bands come from config (never hardcoded here). >20% clamps to the top band.
 */
import type { GradeBand, PmsV3Config } from "./config";

export interface GradeResult {
  /** paid ÷ ctc × 100, or null when CTC is unknown/zero. */
  pctOfCtc: number | null;
  band: GradeBand | null;
  paid: number;
  ctc: number;
}

/** Resolve the % into a band using the configured thresholds. */
function bandForPct(pct: number, bands: GradeBand[]): GradeBand | null {
  if (bands.length === 0) return null;
  // Exactly 0 (or below) → the Fail band (minPct===maxPct===0).
  if (pct <= 0) return bands.find((b) => b.maxPct === 0) ?? bands[0] ?? null;
  // Ascending scan: first band whose (minPct, maxPct] contains pct.
  const scorable = bands.filter((b) => b.maxPct > 0).sort((a, b) => a.minPct - b.minPct);
  for (const b of scorable) {
    if (pct > b.minPct && pct <= b.maxPct) return b;
  }
  // Above the top band → clamp to the highest.
  return scorable[scorable.length - 1] ?? null;
}

/** Compute the grade band for one person from paid + CTC and the config. */
export function computeGrade(paid: number, ctc: number, cfg: PmsV3Config): GradeResult {
  const safePaid = Number.isFinite(paid) ? paid : 0;
  if (!Number.isFinite(ctc) || ctc <= 0) {
    return { pctOfCtc: null, band: null, paid: safePaid, ctc: 0 };
  }
  const pct = (safePaid / ctc) * 100;
  return { pctOfCtc: pct, band: bandForPct(pct, cfg.gradeBands), paid: safePaid, ctc };
}

/**
 * Points earned in the incentive weight block for a grade (Sir, 2026-07-09):
 * A = 100% · B = 75% · C = 50% · D = 25% · Fail = 0% of the block. E.g. a
 * manager (30-pt incentive block) at grade B earns 22.5. `band === null`
 * (unknown CTC) earns 0 — never inflate a missing number.
 */
export function incentivePoints(band: GradeBand | null, weightBlock: number): number {
  if (!band || !Number.isFinite(weightBlock)) return 0;
  return weightBlock * (band.blockFraction ?? 0);
}

/**
 * KPI points (Sir, 2026-07-09): KPI is a MANUAL monthly attainment % (0–100)
 * entered by the manager (per junior) / Manan (everyone) — NOT auto-derived.
 *   kpiPoints = clamp(pct,0,100) / 100 × kpi weight block.
 * A null attainment (nobody entered it) or a null block (non-manager band still
 * pending Sir's ruling) earns 0 here — never inflate a missing number. The read
 * layer decides whether to surface 0 vs "—" (withheld) in the view.
 */
export function kpiPoints(pct: number | null, weightBlock: number | null): number {
  if (pct == null || weightBlock == null || !Number.isFinite(weightBlock)) return 0;
  const clamped = Math.max(0, Math.min(100, pct));
  return (clamped / 100) * weightBlock;
}
