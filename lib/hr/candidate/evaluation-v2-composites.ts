/**
 * CANDIDATE EVALUATION v2 — composite / index scores (PURE, CLIENT-SAFE).
 *
 * The Interview Intelligence roll-ups: Strength/Weakness indices, the five
 * driver composites (Leadership · Execution · Learning · Communication ·
 * Ownership), Technical / Digital-Literacy / AI-Readiness, Sales Readiness, and
 * the Overall-Assessment scorecard. Every composite is a plain average (0..10)
 * over an EXPLICIT list of item ids from the instrument, so the mapping is
 * auditable and adjustable in ONE place (the *_IDS arrays below).
 *
 * These groupings are the proposed defaults (2026-07-28) — tune the id arrays to
 * re-map a parameter into a different composite.
 */

import type { EvaluationInstance } from "@/lib/hr/candidate/evaluation-v2";
import { overallScore, type ScoreContext, type WeightProfile } from "@/lib/hr/candidate/evaluation-v2-scoring";

/* ------------------------------------------------------------------ */
/* Averaging primitive                                                 */
/* ------------------------------------------------------------------ */

/** Mean (0..10) of the rated items in `ids` (skips Can't-Say + unrated), or null. */
export function avgOf(ids: string[], inst: EvaluationInstance): number | null {
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    if (inst.cantSay.includes(id)) continue;
    const v = inst.ratings[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/** Rating band for a 0..10 score → tone + label (green ≥8 / amber ≥6 / red else). */
export function scoreBand(score: number | null): { tone: string; label: string } {
  if (score === null) return { tone: "#94a3b8", label: "—" };
  if (score >= 8) return { tone: "#16a34a", label: "Strong" };
  if (score >= 6) return { tone: "#d97706", label: "Fair" };
  return { tone: "#dc2626", label: "Weak" };
}

/* ------------------------------------------------------------------ */
/* Base ("who they are") — Character (D) + Professional Presence (C)    */
/* ------------------------------------------------------------------ */

export const BASE_IDS = [
  "chr-honesty", "chr-integrity", "chr-family-values", "chr-manners", "chr-humility",
  "chr-positive-attitude", "chr-loyalty", "chr-long-term", "chr-not-opportunistic", "chr-selfless",
  "prs-grooming", "prs-hygiene", "prs-confidence-speaking", "prs-presence-of-mind", "prs-customer-facing",
];

/** % of RATED base params scoring ≥ 7 (strength) / ≤ 4 (weakness). 0..100. */
function ratedBand(ids: string[], inst: EvaluationInstance, pred: (v: number) => boolean): number {
  let hit = 0;
  let n = 0;
  for (const id of ids) {
    const v = inst.ratings[id];
    if (typeof v === "number" && Number.isFinite(v) && !inst.cantSay.includes(id)) {
      n += 1;
      if (pred(v)) hit += 1;
    }
  }
  return n ? Math.round((hit / n) * 100) : 0;
}

export interface BaseComposite {
  average: number | null;
  strengthIndex: number; // % ≥ 7
  weaknessIndex: number; // % ≤ 4
}

export function baseComposite(inst: EvaluationInstance): BaseComposite {
  return {
    average: avgOf(BASE_IDS, inst),
    strengthIndex: ratedBand(BASE_IDS, inst, (v) => v >= 7),
    weaknessIndex: ratedBand(BASE_IDS, inst, (v) => v <= 4),
  };
}

/* ------------------------------------------------------------------ */
/* Drivers → 5 composites + overall (roll-ups over F · G · H · E)       */
/* ------------------------------------------------------------------ */

/** The "performance drivers" pool — Mindset (F) + Execution (G) + Get-Things-Done (H). */
export const DRIVER_IDS = [
  // F · Mindset
  "mnd-common-sense", "mnd-think", "mnd-grasping", "mnd-presence-of-mind",
  "mnd-hunger-to-learn", "mnd-growth-mindset", "mnd-passion", "mnd-sensitive-feedback",
  "mnd-maturity", "mnd-self-confidence", "mnd-self-esteem", "mnd-intuition",
  // G · Execution
  "exe-problem-solving", "exe-solution-orientation", "exe-problem-solving-ability",
  "exe-out-of-box", "exe-strategic-thinking", "exe-execute", "exe-common-sense",
  "exe-work-speed", "exe-ownership", "exe-work-independently", "exe-initiative",
  "exe-temperament", "exe-under-pressure", "exe-handles-rejection", "exe-takes-feedback",
  // H · Get Things Done
  "gtd-convince", "gtd-external", "gtd-peers", "gtd-managers", "gtd-subordinates", "gtd-delegate",
];

export const LEADERSHIP_IDS = [
  "gtd-convince", "gtd-delegate", "gtd-external", "gtd-managers", "gtd-subordinates",
  "cul-ownership", "cul-responsibility", "exp-manager-material",
];
export const EXECUTION_IDS = [
  "exe-work-speed", "exe-execute", "exe-problem-solving", "exe-problem-solving-ability",
  "exe-under-pressure", "exe-initiative", "exe-work-independently", "exe-ownership",
];
export const LEARNING_IDS = [
  "mnd-growth-mindset", "mnd-hunger-to-learn", "mnd-think", "mnd-grasping",
  "mnd-common-sense", "mnd-sensitive-feedback", "exe-out-of-box", "exe-strategic-thinking",
];
/** Communication draws from the Communication section (B) + Presence confidence. */
export const COMMUNICATION_IDS = [
  "com-listen", "com-retain", "com-articulation", "com-explain",
  "com-verbal-english", "com-written-english", "com-reserved-outspoken",
  "com-under-over", "prs-confidence-speaking",
];
export const OWNERSHIP_IDS = [
  "cul-ownership", "cul-responsibility", "chr-loyalty", "chr-long-term",
  "mnd-passion", "exe-ownership", "exe-initiative",
];

export interface DriverComposite {
  leadership: number | null;
  execution: number | null;
  learning: number | null;
  communication: number | null;
  ownership: number | null;
  overall: number | null;
}

export function driverComposite(inst: EvaluationInstance): DriverComposite {
  return {
    leadership: avgOf(LEADERSHIP_IDS, inst),
    execution: avgOf(EXECUTION_IDS, inst),
    learning: avgOf(LEARNING_IDS, inst),
    communication: avgOf(COMMUNICATION_IDS, inst),
    ownership: avgOf(OWNERSHIP_IDS, inst),
    overall: avgOf(DRIVER_IDS, inst),
  };
}

/* ------------------------------------------------------------------ */
/* Technical → Technical / Digital-Literacy / AI-Readiness             */
/* ------------------------------------------------------------------ */

export const TECH_IDS = [
  "tech-typing", "tech-gdrive", "tech-gsheet", "tech-excel-basic", "tech-excel-adv",
  "tech-ppt", "tech-chatgpt", "tech-claude", "tech-canva", "tech-video", "tech-digital-mktg", "tech-drafting",
];
export const DIGITAL_LITERACY_IDS = [
  "tech-gdrive", "tech-gsheet", "tech-excel-basic", "tech-excel-adv", "tech-ppt", "tech-typing", "tech-drafting",
];
export const AI_READINESS_IDS = ["tech-chatgpt", "tech-claude"];

export interface TechnicalComposite {
  technical: number | null;
  digitalLiteracy: number | null;
  aiReadiness: number | null;
}

export function technicalComposite(inst: EvaluationInstance): TechnicalComposite {
  return {
    technical: avgOf(TECH_IDS, inst),
    digitalLiteracy: avgOf(DIGITAL_LITERACY_IDS, inst),
    aiReadiness: avgOf(AI_READINESS_IDS, inst),
  };
}

/* ------------------------------------------------------------------ */
/* Customer-Facing + Sales                                             */
/* ------------------------------------------------------------------ */

export const CUSTOMER_IDS = [
  "prs-customer-facing", "prs-confidence-speaking",
  "com-articulation", "com-explain", "com-listen",
];
export const SALES_IDS = [
  "sl-call", "sl-visit", "sl-references", "sl-persuasion", "sl-convince",
  "sl-collect-money", "sl-customer-explanation", "sl-presentation", "sl-demeanour",
  "sl-money-collection", "sl-negotiation", "sl-influence", "sl-handles-rejection",
  "sl-justify-settle", "sl-not-stuck", "sl-creativity", "sl-closing-instinct",
];

/* ------------------------------------------------------------------ */
/* Overall Assessment scorecard                                        */
/* ------------------------------------------------------------------ */

export interface CompositeScore {
  key: string;
  label: string;
  /** 0..10, or null if unrated. */
  score: number | null;
  tone: string;
}

export interface Composites {
  base: BaseComposite;
  drivers: DriverComposite;
  technical: TechnicalComposite;
  customerFacing: number | null;
  salesReadiness: number | null;
  /** The Overall-Assessment headline scorecard (0..10 each). */
  scorecard: CompositeScore[];
  /** The weighted Overall Interview Score, 0..100. */
  interviewScore: number | null;
}

/**
 * The full composite bundle for one instance. `ctx.isSalesRole` decides whether
 * Sales feeds the interview score (mirrors the scoring core's applicability).
 */
export function computeComposites(
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
  ctx?: ScoreContext,
): Composites {
  const base = baseComposite(inst);
  const drivers = driverComposite(inst);
  const technical = technicalComposite(inst);
  const customerFacing = avgOf(CUSTOMER_IDS, inst);
  const salesReadiness = avgOf(SALES_IDS, inst);
  const overall = overallScore(inst, profile, ctx);

  // Behavioural = Character/Presence base blended with temperament + maturity.
  const behavioural = avgOf(
    [...BASE_IDS, "exe-temperament", "mnd-maturity", "mnd-self-confidence"],
    inst,
  );
  // Culture fit = the Culture (E) section + family values + loyalty.
  const cultureFit = avgOf(
    [
      "cul-customer-centric", "cul-company-centric", "cul-team-centric", "cul-ownership",
      "cul-responsibility", "cul-knowledge-sharing", "cul-flexibility", "cul-altus-fit",
      "chr-family-values", "chr-loyalty",
    ],
    inst,
  );

  const scorecard: CompositeScore[] = [
    { key: "behavioural", label: "Behavioural", score: behavioural, tone: scoreBand(behavioural).tone },
    { key: "communication", label: "Communication", score: drivers.communication, tone: scoreBand(drivers.communication).tone },
    { key: "technical", label: "Technical", score: technical.technical, tone: scoreBand(technical.technical).tone },
    { key: "leadership", label: "Leadership", score: drivers.leadership, tone: scoreBand(drivers.leadership).tone },
    { key: "learning", label: "Learning", score: drivers.learning, tone: scoreBand(drivers.learning).tone },
    { key: "culture-fit", label: "Culture Fit", score: cultureFit, tone: scoreBand(cultureFit).tone },
  ];
  if (ctx?.isSalesRole) {
    scorecard.push({ key: "sales", label: "Sales", score: salesReadiness, tone: scoreBand(salesReadiness).tone });
  }

  return {
    base,
    drivers,
    technical,
    customerFacing,
    salesReadiness,
    scorecard,
    interviewScore: overall.pct,
  };
}
