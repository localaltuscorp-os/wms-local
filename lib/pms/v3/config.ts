/**
 * PMS v3 (WS-2) — the CONFIG: THE single source of every weight, threshold and
 * band. NOTHING in the v3 engines hardcodes a manager / non-manager weight — they
 * all read from here, and the admin editor persists overrides into
 * pms_v3_config.config (jsonb). The defaults below are seed values only.
 *
 * ⚠️ PENDING SIR'S RULING (docs/ALTUS-MEGA-SPEC.md · CONFLICTS): the non-manager
 * weight band has THREE variants and the incentive weight is 20-vs-25. So
 * `nonManagerActive` ships as `null` (unset) — the engine returns a "band pending"
 * result for non-managers until Sir picks one of `nonManagerVariants`. The manager
 * band IS given in the spec, so it is seeded, but STILL as data, never a literal
 * in engine logic.
 */

/** A factor in the monthly model. Objective factors are computed (KPI, Incentive);
 *  subjective factors are the 0–10 human-scored ones; `constitution` is the
 *  para-by-para pillar (scored on its own screen). */
export type FactorKind = "objective" | "subjective" | "constitution";

export interface FactorDef {
  key: string;
  label: string;
  kind: FactorKind;
  /** Short helper shown under the factor in the scoring UI. */
  hint: string;
}

/** Grade band derived from incentive-paid ÷ monthly-CTC (%). */
export interface GradeBand {
  grade: string; // "A" | "B" | "C" | "D" | "Fail"
  label: string;
  /** Lower bound (exclusive for Fail=0) and upper bound (inclusive) as % of CTC. */
  minPct: number;
  maxPct: number;
  color: string; // Altus token-friendly hex (green family / warn / danger)
  /** RESOLVED 2026-07-09 (Sir): share of the incentive weight block this grade
   *  earns — A 1.0 · B 0.75 · C 0.5 · D 0.25 · Fail 0. */
  blockFraction: number;
}

/** How self / manager / manan scores combine into the final subjective score. */
export interface BlendPolicy {
  /** Non-managers: final = manager*managerWeight + manan*mananWeight (sum to 1). */
  nonManagerManagerWeight: number; // 0.5 per spec
  nonManagerMananWeight: number; // 0.5 per spec
  /** Managers: Manan scores out of 100% (manan weight = 1). */
  managerMananWeight: number; // 1.0 per spec
  /** Managers: default Manan's score to a copy of the manager's OWN self score. */
  managerCopySelfDefault: boolean;
}

export interface PmsV3Config {
  /** Full factor catalog (superset across manager + non-manager). */
  factors: FactorDef[];
  /** Manager weight band — factorKey → weight points (spec-given, sums to 100). */
  managerBand: Record<string, number>;
  /** The three non-manager variants Sir gave; canonical TBD. */
  nonManagerVariants: {
    a: Record<string, number>;
    b: Record<string, number>;
    intro: Record<string, number>;
  };
  /** Which non-manager variant is live. `null` = pending Sir's ruling. */
  nonManagerActive: "a" | "b" | "intro" | null;
  /** Incentive → grade bands (% of monthly CTC, PAID only). */
  gradeBands: GradeBand[];
  /** self/manager/manan blend policy. */
  blend: BlendPolicy;
  /** Subjective factor scale (0..scaleMax). */
  subjectiveScaleMax: number; // 10
  /** X-Factor: max extra points Manan may add in one month. */
  xFactorMaxPoints: number;
  /** Constitution pillar: admin distributes this total weight across paragraphs. */
  constitutionTotalWeight: number; // 100
  /** Constitution per-para score scale (0..scaleMax). */
  constitutionScaleMax: number; // 10
}

/** The factor catalog — objective (computed) + subjective (0–10) + constitution. */
const FACTORS: FactorDef[] = [
  { key: "incentives", label: "Incentives", kind: "objective", hint: "Grade band from PAID incentive ÷ monthly CTC" },
  { key: "kpi", label: "KPI", kind: "objective", hint: "Weekly-goals & operational KPI attainment" },
  { key: "constitution", label: "Constitution", kind: "constitution", hint: "Para-by-para: admin + self" },
  { key: "skillUpgrade", label: "Skill Upgrade", kind: "subjective", hint: "Self-learning / Coursera / series — anything that levels you up" },
  { key: "knowledgeSharing", label: "Knowledge Sharing", kind: "subjective", hint: "Training given / shared to the team" },
  { key: "problemSolving", label: "Problem Solving", kind: "subjective", hint: "Cracked hard problems this month" },
  { key: "growthMindset", label: "Growth Mindset", kind: "subjective", hint: "Attitude to learning & feedback" },
  { key: "getThingsDoneFromOthers", label: "Get Things Done From Others", kind: "subjective", hint: "Managers: driving delivery through the team" },
  { key: "takeCareOfTeam", label: "Take Care of Team", kind: "subjective", hint: "Managers: looking after their people" },
  { key: "attendTraining", label: "Attend Training", kind: "subjective", hint: "Non-managers: training attended (one variant)" },
  { key: "teamPlayer", label: "Team Player", kind: "subjective", hint: "Non-managers: collaboration" },
];

/** Manager band — from the spec (total 100). Data, not literals-in-logic. */
const MANAGER_BAND: Record<string, number> = {
  incentives: 30,
  kpi: 30,
  constitution: 10,
  skillUpgrade: 5,
  knowledgeSharing: 5,
  problemSolving: 5,
  growthMindset: 5,
  getThingsDoneFromOthers: 5,
  takeCareOfTeam: 5,
};

/** Non-manager variant (a): Inc 25 · KPI 25 · Constitution 15 · Skill 10 · Problem 10 · Growth 10 · Team 5. */
const NONMGR_A: Record<string, number> = {
  incentives: 25,
  kpi: 25,
  constitution: 15,
  skillUpgrade: 10,
  problemSolving: 10,
  growthMindset: 10,
  teamPlayer: 5,
};

/** Non-manager variant (b): splits Skill into Attend-Training 5 + Skill 5. */
const NONMGR_B: Record<string, number> = {
  incentives: 25,
  kpi: 25,
  constitution: 15,
  attendTraining: 5,
  skillUpgrade: 5,
  problemSolving: 10,
  growthMindset: 10,
  teamPlayer: 5,
};

/** Non-manager "intro" variant: the brief's 20% incentive intro reading. */
const NONMGR_INTRO: Record<string, number> = {
  incentives: 20,
  kpi: 25,
  constitution: 15,
  skillUpgrade: 15,
  problemSolving: 10,
  growthMindset: 10,
  teamPlayer: 5,
};

/** Grade bands — 0=Fail, 0–5%=D, 5–10%=C, 10–15%=B, 15–20%=A (Altus tokens).
 *  blockFraction = share of the incentive weight block the grade earns
 *  (Sir, 2026-07-09): A 1.0 · B 0.75 · C 0.5 · D 0.25 · Fail 0. */
const GRADE_BANDS: GradeBand[] = [
  { grade: "Fail", label: "Fail", minPct: 0, maxPct: 0, color: "#dc2626", blockFraction: 0 },
  { grade: "D", label: "D", minPct: 0, maxPct: 5, color: "#d97706", blockFraction: 0.25 },
  { grade: "C", label: "C", minPct: 5, maxPct: 10, color: "#ca8a04", blockFraction: 0.5 },
  { grade: "B", label: "B", minPct: 10, maxPct: 15, color: "#16a34a", blockFraction: 0.75 },
  { grade: "A", label: "A", minPct: 15, maxPct: 20, color: "#15803d", blockFraction: 1 },
];

export const DEFAULT_PMS_V3_CONFIG: PmsV3Config = {
  factors: FACTORS,
  managerBand: MANAGER_BAND,
  nonManagerVariants: { a: NONMGR_A, b: NONMGR_B, intro: NONMGR_INTRO },
  nonManagerActive: "b", // RESOLVED 2026-07-09 (Sir): Variant B is canonical
  gradeBands: GRADE_BANDS,
  blend: {
    nonManagerManagerWeight: 0.5,
    nonManagerMananWeight: 0.5,
    managerMananWeight: 1,
    managerCopySelfDefault: true,
  },
  subjectiveScaleMax: 10,
  xFactorMaxPoints: 10,
  constitutionTotalWeight: 100,
  constitutionScaleMax: 10,
};

/** Coerce unknown → finite number, else fallback (0). NEVER invents a policy weight. */
export function num(v: unknown, fallback = 0): number {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : fallback;
}

/**
 * Deep-parse a raw pms_v3_config.config jsonb blob into the typed shape, falling
 * back to the seed defaults for any missing branch (so a half-written row never
 * throws). The engine treats the returned object as the ONLY policy source.
 */
export function parseV3Config(raw: unknown): PmsV3Config {
  const r = (raw ?? {}) as Partial<PmsV3Config>;
  const d = DEFAULT_PMS_V3_CONFIG;
  return {
    factors: Array.isArray(r.factors) && r.factors.length ? (r.factors as FactorDef[]) : d.factors,
    managerBand: (r.managerBand as Record<string, number>) ?? d.managerBand,
    nonManagerVariants: (r.nonManagerVariants as PmsV3Config["nonManagerVariants"]) ?? d.nonManagerVariants,
    nonManagerActive: (r.nonManagerActive ?? d.nonManagerActive) as PmsV3Config["nonManagerActive"],
    gradeBands: Array.isArray(r.gradeBands) && r.gradeBands.length ? (r.gradeBands as GradeBand[]) : d.gradeBands,
    blend: { ...d.blend, ...(r.blend as Partial<BlendPolicy> | undefined) },
    subjectiveScaleMax: num(r.subjectiveScaleMax, d.subjectiveScaleMax),
    xFactorMaxPoints: num(r.xFactorMaxPoints, d.xFactorMaxPoints),
    constitutionTotalWeight: num(r.constitutionTotalWeight, d.constitutionTotalWeight),
    constitutionScaleMax: num(r.constitutionScaleMax, d.constitutionScaleMax),
  };
}

/** The live weight band for a person, from config. `null` when the non-manager
 *  band is still pending Sir's ruling (nonManagerActive unset). */
export function activeBand(cfg: PmsV3Config, isManager: boolean): Record<string, number> | null {
  if (isManager) return cfg.managerBand;
  if (!cfg.nonManagerActive) return null;
  return cfg.nonManagerVariants[cfg.nonManagerActive];
}
