/**
 * CANDIDATE EVALUATION v2 — the PURE, CLIENT-SAFE scoring core.
 *
 * Micro-average per section → macro weight → weighted overall, with:
 *  · renormalization over APPLICABLE (gate / sales-role) + RATED sections,
 *  · "Can't Say" items excluded from averages,
 *  · Pre-Requisites as a hard gate (any CRITICAL "No" without an exception flags review),
 *  · the Overall gut number reported SEPARATELY, never blended in.
 *
 * No server imports. Both the client screens and the server report use this.
 * Composite/index scores (Leadership, Execution, …) live in
 * `evaluation-v2-composites.ts`.
 */

import {
  RATING_SECTIONS,
  DEFAULT_SECTION_WEIGHTS,
  ELIGIBILITY_ITEM_IDS,
  CRITICAL_PREREQ_IDS,
  sectionItemIds,
  type EvalSection,
  type EvalItem,
  type EvaluationInstance,
} from "@/lib/hr/candidate/evaluation-v2";

/** sectionId → relative weight. Partial maps fall back to the default weight. */
export type WeightProfile = Record<string, number>;

/** Context that decides which optional sections apply (e.g. Sales for sales roles). */
export interface ScoreContext {
  isSalesRole?: boolean;
}

/** The weight for a section, from the profile or its default. */
export function weightOf(sectionId: string, profile?: WeightProfile | null): number {
  const w = profile?.[sectionId];
  if (typeof w === "number" && Number.isFinite(w) && w >= 0) return w;
  return DEFAULT_SECTION_WEIGHTS[sectionId] ?? 0;
}

/**
 * A section is applicable unless:
 *  · it's `salesOnly` and the role isn't sales/customer-facing, or
 *  · it's a `gate` section whose gate answer isn't in `revealWhen`.
 */
export function isSectionApplicable(
  section: EvalSection,
  inst: EvaluationInstance,
  ctx?: ScoreContext,
): boolean {
  if (section.salesOnly && !ctx?.isSalesRole) return false;
  if (section.input === "gate" && section.gate) {
    const ans = inst.gates?.[section.id];
    return ans != null && section.gate.revealWhen.includes(ans);
  }
  return true;
}

function ratedAvg(items: EvalItem[], inst: EvaluationInstance): { avg: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const it of items) {
    if (inst.cantSay.includes(it.id)) continue;
    const v = inst.ratings[it.id];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  return { avg: count ? sum / count : 0, count };
}

/**
 * A section's micro average (0..10), or null when nothing in it is rated.
 * Sections with sub-group weights blend by those weights; others are a flat
 * average over their rated items.
 */
export function sectionMicro(section: EvalSection, inst: EvaluationInstance): number | null {
  const anyWeighted = section.groups.some((grp) => (grp.weight ?? 0) > 0);
  if (anyWeighted) {
    let num = 0;
    let den = 0;
    for (const grp of section.groups) {
      const w = grp.weight ?? 0;
      if (w <= 0) continue;
      const { avg, count } = ratedAvg(grp.items, inst);
      if (count === 0) continue;
      num += avg * w;
      den += w;
    }
    return den > 0 ? num / den : null;
  }
  const { avg, count } = ratedAvg(
    section.groups.flatMap((grp) => grp.items),
    inst,
  );
  return count > 0 ? avg : null;
}

export interface SectionScore {
  sectionId: string;
  code: string;
  title: string;
  /** 0..10 micro, or null if unrated. */
  micro: number | null;
  /** the applied macro weight (Y in "X / Y"). */
  weight: number;
  /** weighted section points (X in "X / Y"). */
  x: number;
  applicable: boolean;
}

export function sectionScore(
  section: EvalSection,
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
  ctx?: ScoreContext,
): SectionScore {
  const micro = sectionMicro(section, inst);
  const weight = weightOf(section.id, profile);
  const x = micro === null ? 0 : Math.round((micro / 10) * weight);
  return {
    sectionId: section.id,
    code: section.code,
    title: section.title,
    micro,
    weight,
    x,
    applicable: isSectionApplicable(section, inst, ctx),
  };
}

/** All weighted section scores (rating sections), in definition order. */
export function allSectionScores(
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
  ctx?: ScoreContext,
): SectionScore[] {
  return RATING_SECTIONS.map((s) => sectionScore(s, inst, profile, ctx));
}

export interface OverallScore {
  /** 0..10 weighted average over applicable + rated + weighted sections, or null. */
  avg: number | null;
  /** 0..100 convenience (avg × 10). */
  pct: number | null;
  ratedSections: number;
  applicableSections: number;
}

/**
 * The weighted overall (0..10). Applicable sections exclude a gated-off / non-sales
 * section; rated sections exclude fully-unrated ones; the weights renormalize over
 * what remains, so a partly-filled form still yields a sane number.
 */
export function overallScore(
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
  ctx?: ScoreContext,
): OverallScore {
  let num = 0;
  let den = 0;
  let rated = 0;
  let applicable = 0;
  for (const s of RATING_SECTIONS) {
    if (!isSectionApplicable(s, inst, ctx)) continue;
    applicable += 1;
    const micro = sectionMicro(s, inst);
    if (micro === null) continue;
    const w = weightOf(s.id, profile);
    if (w <= 0) continue;
    num += micro * w;
    den += w;
    rated += 1;
  }
  const avg = den > 0 ? num / den : null;
  return { avg, pct: avg === null ? null : Math.round(avg * 10), ratedSections: rated, applicableSections: applicable };
}

export interface EligibilityVerdict {
  answered: number;
  total: number;
  /** item ids answered "No" (all pre-requisites). */
  noItems: string[];
  /** CRITICAL item ids answered "No". */
  criticalNoItems: string[];
  /** whether a section-level Exceptions note was recorded. */
  hasException: boolean;
  /** any un-excepted CRITICAL "No" → the candidate is flagged / a deal-breaker. */
  dealbreaker: boolean;
  /** any critical "No" at all → surface a "flag for review" banner. */
  flaggedForReview: boolean;
}

export function eligibilityVerdict(inst: EvaluationInstance): EligibilityVerdict {
  const noItems = ELIGIBILITY_ITEM_IDS.filter((id) => inst.passfail[id] === "no");
  const criticalNoItems = CRITICAL_PREREQ_IDS.filter((id) => inst.passfail[id] === "no");
  const answered = ELIGIBILITY_ITEM_IDS.filter((id) => Boolean(inst.passfail[id])).length;
  const hasException = (inst.sectionNotes["prerequisites"] ?? "").trim().length > 0;
  return {
    answered,
    total: ELIGIBILITY_ITEM_IDS.length,
    noItems,
    criticalNoItems,
    hasException,
    dealbreaker: criticalNoItems.length > 0 && !hasException,
    flaggedForReview: criticalNoItems.length > 0,
  };
}

/** Progress across the rating items of the APPLICABLE sections (rated or Can't-Say). */
export function ratingProgress(inst: EvaluationInstance, ctx?: ScoreContext): { rated: number; total: number } {
  const items = RATING_SECTIONS.filter((s) => isSectionApplicable(s, inst, ctx)).flatMap(sectionItemIds);
  const rated = items.filter((id) => id in inst.ratings || inst.cantSay.includes(id)).length;
  return { rated, total: items.length };
}
