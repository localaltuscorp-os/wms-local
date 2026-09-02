import "server-only";

import { db } from "@/lib/db";
import { candidateIntake, employees } from "@/db/schema";
import {
  EVAL_SECTIONS,
  RATING_SECTIONS,
  type EvaluationInstance,
  type EvaluationV2,
} from "@/lib/hr/candidate/evaluation-v2";
import {
  computeComposites,
  BASE_IDS,
  TECH_IDS,
} from "@/lib/hr/candidate/evaluation-v2-composites";
import {
  overallScore,
  sectionMicro,
  eligibilityVerdict,
  type ScoreContext,
} from "@/lib/hr/candidate/evaluation-v2-scoring";

/**
 * HIRING ANALYTICS — the read model behind the Interview Intelligence executive
 * dashboard (/hr/hiring-analytics).
 *
 * ONE select over candidate_intake (a small table) + ONE tiny roster select for
 * interviewer names — everything else is computed in JS off the eval-v2 pure
 * scoring/composite core. Load-neutral: no joins, no per-row queries, no writes.
 *
 * Every metric degrades gracefully: nulls / empty arrays when the data is thin,
 * so the surface renders sensible empty-states rather than throwing.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CandidateStatus = "new" | "shortlisted" | "rejected" | "hired";

export interface PipelineCounts {
  new: number;
  shortlisted: number;
  rejected: number;
  hired: number;
}

export interface FunnelRow {
  position: string;
  total: number;
  new: number;
  shortlisted: number;
  rejected: number;
  hired: number;
  /** hired / decided (hired+rejected), 0..100 or null. */
  hireRate: number | null;
}

export interface SkillBar {
  id: string;
  label: string;
  /** Mean 0..10 across candidates who rated it, or null. */
  avg: number | null;
  /** How many candidates contributed a rating. */
  count: number;
}

export interface InterviewerStat {
  id: string | null;
  name: string;
  /** Interviews conducted (forms created). */
  count: number;
  /** Evaluated interviews with a computed score. */
  scored: number;
  /** Mean interview score 0..100 across their scored interviews, or null. */
  avgScore: number | null;
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface SourceCount {
  source: string;
  count: number;
  /** hired / total from this source, 0..100 or null. */
  hireRate: number | null;
}

export interface TrendPoint {
  /** YYYY-MM. */
  month: string;
  /** Human label e.g. "Jul '26". */
  label: string;
  count: number;
  /** Mean interview score 0..100 that month, or null. */
  avgScore: number | null;
}

export interface SectionAvg {
  sectionId: string;
  code: string;
  title: string;
  /** Mean micro 0..10 across candidates, or null. */
  avg: number | null;
  count: number;
}

export interface HiringAnalytics {
  /** ISO of computation. */
  generatedAt: string;

  /* Headline counts */
  totalCandidates: number;
  /** Candidates with at least one usable evaluation instance. */
  totalInterviews: number;
  hasEvaluations: boolean;

  /* Pipeline */
  pipeline: PipelineCounts;
  pipelineTotal: number;
  decided: number;
  hired: number;
  rejected: number;

  /* Rates (0..100) */
  hireRate: number | null;
  rejectRate: number | null;

  /* Scores */
  avgInterviewScore: number | null; // 0..100 weighted composite
  avgCandidateRating: number | null; // 0..10 interviewer gut

  /* People */
  topInterviewers: InterviewerStat[];

  /* Funnels & distributions */
  funnel: FunnelRow[];
  technicalSkills: SkillBar[];
  behaviouralSkills: SkillBar[];
  sectionAverages: SectionAvg[];

  /* Qualitative */
  rejectionReasons: ReasonCount[];
  sources: SourceCount[];
  sourcesAvailable: boolean;

  /* Timing */
  avgCompletionHours: number | null;
  completionSamples: number;

  /* Trend */
  trend: TrendPoint[];

  /* Offer acceptance (approx — no explicit "offered" state) */
  offerAcceptanceRate: number | null;
  offered: number;
  accepted: number;

  /* Flags for review (any critical pre-req "No" without exception) */
  flaggedForReview: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const SALES_KEYWORDS = [
  "sales",
  "business development",
  "bd ",
  "bde",
  "relationship",
  "marketing",
  "telecaller",
  "tele caller",
  "customer",
  "account manager",
  "field",
];

function isSalesRole(position: string | null | undefined): boolean {
  if (!position) return false;
  const p = position.toLowerCase();
  return SALES_KEYWORDS.some((k) => p.includes(k.trim()));
}

/** Pick the evaluation instance to score from — interviewer first, else management. */
function pickInstance(blob: EvaluationV2 | null): EvaluationInstance | null {
  if (!blob) return null;
  return blob.interviewer ?? blob.management ?? null;
}

/** Does this instance carry any usable signal (so it counts as an "interview")? */
function hasSignal(inst: EvaluationInstance | null): boolean {
  if (!inst) return false;
  const ratings = inst.ratings ? Object.keys(inst.ratings).length : 0;
  const passfail = inst.passfail ? Object.keys(inst.passfail).length : 0;
  return ratings > 0 || passfail > 0 || inst.overall != null || inst.recommendation != null;
}

/** Round to 1 dp or null. */
function r1(n: number | null): number | null {
  return n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;
}

/** Build id → label across every eval section (for skill bars). */
const ITEM_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const s of EVAL_SECTIONS) {
    for (const g of s.groups) {
      for (const it of g.items) map[it.id] = it.label;
    }
  }
  return map;
})();

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const mi = Number(m) - 1;
  return `${MONTHS_SHORT[mi] ?? m} '${(y ?? "").slice(2)}`;
}

/** Normalise a free-text rejection reason to a tally key (case/space folded). */
function normReason(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
/** Title-case the display form of a folded reason. */
function displayReason(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  return t.length > 90 ? `${t.slice(0, 88)}…` : t;
}

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

export async function loadHiringAnalytics(): Promise<HiringAnalytics> {
  const generatedAt = new Date().toISOString();

  // ONE select over the (small) candidate table + ONE tiny roster select.
  const [rows, roster] = await Promise.all([
    db
      .select({
        id: candidateIntake.id,
        positionApplied: candidateIntake.positionApplied,
        status: candidateIntake.status,
        data: candidateIntake.data,
        evaluationV2: candidateIntake.evaluationV2,
        createdById: candidateIntake.createdById,
        createdAt: candidateIntake.createdAt,
        submittedAt: candidateIntake.submittedAt,
      })
      .from(candidateIntake),
    db.select({ id: employees.id, name: employees.name }).from(employees),
  ]);

  const nameById = new Map(roster.map((e) => [e.id, e.name]));

  const empty = emptyAnalytics(generatedAt);
  if (rows.length === 0) return empty;

  // Accumulators
  const pipeline: PipelineCounts = { new: 0, shortlisted: 0, rejected: 0, hired: 0 };
  let totalInterviews = 0;
  let flaggedForReview = 0;

  let scoreSum = 0;
  let scoreN = 0;
  let ratingSum = 0;
  let ratingN = 0;

  const funnelMap = new Map<string, FunnelRow>();
  const techAgg = new Map<string, { sum: number; n: number }>();
  const baseAgg = new Map<string, { sum: number; n: number }>();
  const sectionAgg = new Map<string, { sum: number; n: number }>();
  const interviewerMap = new Map<string, { count: number; scored: number; sum: number; sN: number }>();
  const reasonMap = new Map<string, { count: number; display: string }>();
  const sourceMap = new Map<string, { total: number; hired: number }>();
  const trendMap = new Map<string, { count: number; sum: number; n: number }>();

  let completionSum = 0;
  let completionN = 0;

  for (const row of rows) {
    const status = (row.status as CandidateStatus) ?? "new";
    if (status in pipeline) pipeline[status] += 1;

    const position = (row.positionApplied ?? "").trim() || "Unspecified";

    // ── Funnel by position ──
    const f = funnelMap.get(position) ?? { position, total: 0, new: 0, shortlisted: 0, rejected: 0, hired: 0, hireRate: null };
    f.total += 1;
    if (status === "new") f.new += 1;
    else if (status === "shortlisted") f.shortlisted += 1;
    else if (status === "rejected") f.rejected += 1;
    else if (status === "hired") f.hired += 1;
    funnelMap.set(position, f);

    // ── Source (data jsonb → personal.source) ──
    const dataObj = (row.data ?? {}) as Record<string, unknown>;
    const rawSource = (dataObj["personal.source"] ?? dataObj["source"]) as string | undefined;
    const source = (rawSource ?? "").trim();
    if (source) {
      const s = sourceMap.get(source) ?? { total: 0, hired: 0 };
      s.total += 1;
      if (status === "hired") s.hired += 1;
      sourceMap.set(source, s);
    }

    // ── Trend bucket (by created month) — all candidates ──
    const created = row.createdAt ? new Date(row.createdAt) : null;
    const mKey = created ? monthKey(created) : null;
    if (mKey) {
      const t = trendMap.get(mKey) ?? { count: 0, sum: 0, n: 0 };
      t.count += 1;
      trendMap.set(mKey, t);
    }

    // ── Completion time ──
    if (row.createdAt && row.submittedAt) {
      const ms = new Date(row.submittedAt).getTime() - new Date(row.createdAt).getTime();
      if (Number.isFinite(ms) && ms > 0) {
        completionSum += ms / 3_600_000; // → hours
        completionN += 1;
      }
    }

    // ── Interviewer tally (form creator) — every candidate ──
    if (row.createdById) {
      const iv = interviewerMap.get(row.createdById) ?? { count: 0, scored: 0, sum: 0, sN: 0 };
      iv.count += 1;
      interviewerMap.set(row.createdById, iv);
    }

    // ── Evaluation-driven metrics ──
    const inst = pickInstance((row.evaluationV2 as EvaluationV2 | null) ?? null);
    if (!hasSignal(inst) || !inst) continue;
    totalInterviews += 1;

    // Sales applicability: prefer the "Responsibility to Sell?" (L) gate answer;
    // fall back to a job-title keyword heuristic for evals filled before the gate.
    const sellAnswer = inst.gates?.["sell"];
    const salesRole = sellAnswer != null ? sellAnswer === "yes" : isSalesRole(row.positionApplied);
    const ctx: ScoreContext = { isSalesRole: salesRole };

    const composites = computeComposites(inst, null, ctx);
    const overall = overallScore(inst, null, ctx);
    const verdict = eligibilityVerdict(inst);
    if (verdict.flaggedForReview) flaggedForReview += 1;

    // Interview score (0..100 weighted)
    const iScore = composites.interviewScore ?? overall.pct;
    if (iScore != null) {
      scoreSum += iScore;
      scoreN += 1;
      if (mKey) {
        const t = trendMap.get(mKey)!;
        t.sum += iScore;
        t.n += 1;
      }
      if (row.createdById) {
        const iv = interviewerMap.get(row.createdById)!;
        iv.scored += 1;
        iv.sum += iScore;
        iv.sN += 1;
      }
    }

    // Candidate rating (interviewer gut 0..10)
    if (inst.overall != null && Number.isFinite(inst.overall)) {
      ratingSum += inst.overall;
      ratingN += 1;
    }

    // Technical + behavioural skill distributions
    for (const id of TECH_IDS) accumRating(techAgg, id, inst);
    for (const id of BASE_IDS) accumRating(baseAgg, id, inst);

    // Per-section micro averages
    for (const s of RATING_SECTIONS) {
      const micro = sectionMicro(s, inst);
      if (micro != null) {
        const a = sectionAgg.get(s.id) ?? { sum: 0, n: 0 };
        a.sum += micro;
        a.n += 1;
        sectionAgg.set(s.id, a);
      }
    }

    // Rejection reasons — only for rejected candidates
    if (status === "rejected") {
      const reason = primaryReason(inst);
      if (reason) {
        const key = normReason(reason);
        const e = reasonMap.get(key) ?? { count: 0, display: displayReason(reason) };
        e.count += 1;
        reasonMap.set(key, e);
      }
    }
  }

  // ── Derive rates ──
  const hired = pipeline.hired;
  const rejected = pipeline.rejected;
  const decided = hired + rejected;
  const pipelineTotal = pipeline.new + pipeline.shortlisted + pipeline.rejected + pipeline.hired;

  const hireRate = decided > 0 ? Math.round((hired / decided) * 100) : null;
  const rejectRate = decided > 0 ? Math.round((rejected / decided) * 100) : null;

  // Offer acceptance (approx): of those who cleared to an offer (shortlisted +
  // hired), how many actually joined? No explicit "offered" state exists, so
  // this is a labelled approximation and null when there's nothing to divide.
  const offered = pipeline.shortlisted + pipeline.hired;
  const accepted = pipeline.hired;
  const offerAcceptanceRate = offered > 0 ? Math.round((accepted / offered) * 100) : null;

  // ── Funnel finalize ──
  const funnel: FunnelRow[] = [...funnelMap.values()]
    .map((f) => {
      const d = f.hired + f.rejected;
      return { ...f, hireRate: d > 0 ? Math.round((f.hired / d) * 100) : null };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  // ── Skills ──
  const technicalSkills = TECH_IDS.map((id) => barFrom(id, techAgg)).sort(bySkill);
  const behaviouralSkills = BASE_IDS.map((id) => barFrom(id, baseAgg)).sort(bySkill);

  // ── Section averages (definition order) ──
  const sectionAverages: SectionAvg[] = RATING_SECTIONS.map((s) => {
    const a = sectionAgg.get(s.id);
    return {
      sectionId: s.id,
      code: s.code,
      title: s.title,
      avg: a && a.n > 0 ? r1(a.sum / a.n) : null,
      count: a?.n ?? 0,
    };
  });

  // ── Interviewers ──
  const topInterviewers: InterviewerStat[] = [...interviewerMap.entries()]
    .map(([id, v]) => ({
      id,
      name: nameById.get(id) ?? "Unknown",
      count: v.count,
      scored: v.scored,
      avgScore: v.sN > 0 ? Math.round(v.sum / v.sN) : null,
    }))
    .sort((a, b) => b.count - a.count || (b.avgScore ?? -1) - (a.avgScore ?? -1))
    .slice(0, 8);

  // ── Rejection reasons ──
  const rejectionReasons: ReasonCount[] = [...reasonMap.values()]
    .map((e) => ({ reason: e.display, count: e.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── Sources ──
  const sourceEntries = [...sourceMap.entries()];
  const sources: SourceCount[] = sourceEntries
    .map(([source, v]) => ({
      source,
      count: v.total,
      hireRate: v.total > 0 ? Math.round((v.hired / v.total) * 100) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── Trend (chronological, last 12 buckets) ──
  const trend: TrendPoint[] = [...trendMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-12)
    .map(([month, v]) => ({
      month,
      label: monthLabel(month),
      count: v.count,
      avgScore: v.n > 0 ? Math.round(v.sum / v.n) : null,
    }));

  return {
    generatedAt,
    totalCandidates: rows.length,
    totalInterviews,
    hasEvaluations: totalInterviews > 0,
    pipeline,
    pipelineTotal,
    decided,
    hired,
    rejected,
    hireRate,
    rejectRate,
    avgInterviewScore: scoreN > 0 ? Math.round(scoreSum / scoreN) : null,
    avgCandidateRating: ratingN > 0 ? r1(ratingSum / ratingN) : null,
    topInterviewers,
    funnel,
    technicalSkills,
    behaviouralSkills,
    sectionAverages,
    rejectionReasons,
    sources,
    sourcesAvailable: sourceEntries.length > 0,
    avgCompletionHours: completionN > 0 ? r1(completionSum / completionN) : null,
    completionSamples: completionN,
    trend,
    offerAcceptanceRate,
    offered,
    accepted,
    flaggedForReview,
  };
}

/* ------------------------------------------------------------------ */
/* Small accumulation helpers                                          */
/* ------------------------------------------------------------------ */

function accumRating(agg: Map<string, { sum: number; n: number }>, id: string, inst: EvaluationInstance): void {
  if (inst.cantSay?.includes(id)) return;
  const v = inst.ratings?.[id];
  if (typeof v === "number" && Number.isFinite(v)) {
    const a = agg.get(id) ?? { sum: 0, n: 0 };
    a.sum += v;
    a.n += 1;
    agg.set(id, a);
  }
}

function barFrom(id: string, agg: Map<string, { sum: number; n: number }>): SkillBar {
  const a = agg.get(id);
  return {
    id,
    label: ITEM_LABELS[id] ?? id,
    avg: a && a.n > 0 ? Math.round((a.sum / a.n) * 10) / 10 : null,
    count: a?.n ?? 0,
  };
}

function bySkill(a: SkillBar, b: SkillBar): number {
  // Rated skills first (by score desc), unrated sink to the bottom.
  if (a.avg == null && b.avg == null) return 0;
  if (a.avg == null) return 1;
  if (b.avg == null) return -1;
  return b.avg - a.avg;
}

/** The primary rejection reason for an instance: override → concerns → risk → justification. */
function primaryReason(inst: EvaluationInstance): string | null {
  const ov = inst.recommendationOverride?.reason?.trim();
  if (ov) return ov;
  const tb = inst.textboxes ?? {};
  for (const k of ["concerns", "riskAreas", "justification"] as const) {
    const val = tb[k]?.trim();
    if (val) return val;
  }
  return null;
}

function emptyAnalytics(generatedAt: string): HiringAnalytics {
  return {
    generatedAt,
    totalCandidates: 0,
    totalInterviews: 0,
    hasEvaluations: false,
    pipeline: { new: 0, shortlisted: 0, rejected: 0, hired: 0 },
    pipelineTotal: 0,
    decided: 0,
    hired: 0,
    rejected: 0,
    hireRate: null,
    rejectRate: null,
    avgInterviewScore: null,
    avgCandidateRating: null,
    topInterviewers: [],
    funnel: [],
    technicalSkills: [],
    behaviouralSkills: [],
    sectionAverages: [],
    rejectionReasons: [],
    sources: [],
    sourcesAvailable: false,
    avgCompletionHours: null,
    completionSamples: 0,
    trend: [],
    offerAcceptanceRate: null,
    offered: 0,
    accepted: 0,
    flaggedForReview: 0,
  };
}
