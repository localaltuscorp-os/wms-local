/**
 * PMS Layer 2 — the typed shape of pms_score_config (mig 0095 + v2 in 0096).
 *
 * THE single source of every weight / threshold / coefficient. The pure engines
 * (score / promotion / recognition) read ONLY this — no policy is ever hardcoded
 * in engine logic. The DB row stores weights/thresholds/formula as jsonb so the
 * shape can grow without a migration, and the admin editor writes it back.
 *
 * v2 model (leadership's notes, docs/PMS_FULL_SPEC.md) — a score out of 100 over
 * FIVE pillars: KPI 50 · Skill-Upgrade 20 · Compliance 10 · Attitude 10 ·
 * Team-Work 10. Each pillar blends sub-signals via the `formula` sub-weights.
 *
 * If a key is ever missing (e.g. an un-migrated row) the engine treats its
 * contribution as 0 — it never falls back to a baked-in default, so behaviour is
 * always driven by the data in the config row.
 */

/** The five pillar weights (relative — the engine normalises by their sum). */
export interface PmsWeights {
  kpi: number; // Weekly Goals + Incentive (target vs actual)
  skillUpgrade: number; // Training given/attended + self-learning + weekly share
  compliance: number; // DCC + Daily Checklist
  attitude: number; // monthly manager review (attitude/behaviour/skill)
  teamwork: number; // peer + subordinate (juniors/colleagues) review
}

export interface PmsThresholds {
  promotionScore: number; // score ≥ this flags a promotion review
  recognitionScore: number; // score ≥ this suggests recognition
  minTenureDays: number; // days employed before promotion-eligible
  // Training obligations (per person, per month) — drive the Skill-Upgrade pillar.
  trainGiveHoursPerMonth: number; // managers must GIVE this many hours
  trainAttendHoursPerMonth: number; // everyone must ATTEND this many hours
  selfLearnHoursPerMonth: number; // everyone must self-learn this many hours
  shareMinPerWeek: number; // minutes of the weekly Share (compulsory)
  assessmentPassPct: number; // < this on an assessment = fail → redo (waivable)
  noScheduleAlertDays: number; // alert if no training scheduled for > this many days
  noAttendPromptDays: number; // prompt to pick a training if none attended in > this
  maxSessionMinutes: number; // no single session longer than this
  lateGraceDays: number;
  onTimeRateFloor: number;
}

export interface PmsFormula {
  // KPI sub-weights
  kpiWeeklyWeight: number;
  kpiIncentiveWeight: number;
  // Skill-Upgrade sub-weights
  skillAttendWeight: number;
  skillGiveWeight: number;
  skillSelfLearnWeight: number;
  skillShareWeight: number;
  // Compliance sub-weights
  compDccWeight: number;
  compChecklistWeight: number;
  // Review rating normalisation: rate = (rating - floor) / (ceil - floor), clamped.
  ratingFloor: number;
  ratingCeil: number;
}

/** The parsed config the engines consume. */
export interface PmsScoreConfig {
  weights: PmsWeights;
  thresholds: PmsThresholds;
  formula: PmsFormula;
}

/** Coerce an unknown jsonb value to a finite number, else 0. NEVER substitutes a
 *  policy default — a missing key contributes nothing rather than an invented
 *  weight. */
export function n(v: unknown): number {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : 0;
}

/** Parse the raw jsonb columns of a pms_score_config row into the typed shape.
 *  Reads each key explicitly (so the engines stay literal-free). */
export function parseScoreConfig(raw: {
  weights: unknown;
  thresholds: unknown;
  formula: unknown;
}): PmsScoreConfig {
  const w = (raw.weights ?? {}) as Record<string, unknown>;
  const t = (raw.thresholds ?? {}) as Record<string, unknown>;
  const f = (raw.formula ?? {}) as Record<string, unknown>;
  return {
    weights: {
      kpi: n(w.kpi),
      skillUpgrade: n(w.skillUpgrade),
      compliance: n(w.compliance),
      attitude: n(w.attitude),
      teamwork: n(w.teamwork),
    },
    thresholds: {
      promotionScore: n(t.promotionScore),
      recognitionScore: n(t.recognitionScore),
      minTenureDays: n(t.minTenureDays),
      trainGiveHoursPerMonth: n(t.trainGiveHoursPerMonth),
      trainAttendHoursPerMonth: n(t.trainAttendHoursPerMonth),
      selfLearnHoursPerMonth: n(t.selfLearnHoursPerMonth),
      shareMinPerWeek: n(t.shareMinPerWeek),
      assessmentPassPct: n(t.assessmentPassPct),
      noScheduleAlertDays: n(t.noScheduleAlertDays),
      noAttendPromptDays: n(t.noAttendPromptDays),
      maxSessionMinutes: n(t.maxSessionMinutes),
      lateGraceDays: n(t.lateGraceDays),
      onTimeRateFloor: n(t.onTimeRateFloor),
    },
    formula: {
      kpiWeeklyWeight: n(f.kpiWeeklyWeight),
      kpiIncentiveWeight: n(f.kpiIncentiveWeight),
      skillAttendWeight: n(f.skillAttendWeight),
      skillGiveWeight: n(f.skillGiveWeight),
      skillSelfLearnWeight: n(f.skillSelfLearnWeight),
      skillShareWeight: n(f.skillShareWeight),
      compDccWeight: n(f.compDccWeight),
      compChecklistWeight: n(f.compChecklistWeight),
      ratingFloor: n(f.ratingFloor),
      ratingCeil: n(f.ratingCeil),
    },
  };
}
