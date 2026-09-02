/**
 * PMS v3 (WS-2) — PURE blending + perception-gap engine.
 *
 * Blending (all weights from config, never hardcoded):
 *   • Non-managers: final = manager × managerWeight + manan × mananWeight
 *     (spec: 50% / 50%).
 *   • Managers: Manan scores out of 100% (manan weight = 1). Manan may DEFAULT his
 *     score to a copy of the manager's OWN self score for managers he doesn't work
 *     with directly (config.blend.managerCopySelfDefault).
 *
 * Perception gap = the (self, manager, manan) triple shown back to the person so
 * they can see where their self-view diverges from how they're rated.
 */
import type { PmsV3Config } from "./config";

export interface RaterScores {
  self: number | null;
  manager: number | null;
  manan: number | null;
}

export interface BlendResult {
  /** The blended final subjective score (same scale as the inputs), or null when
   *  the required rater(s) haven't scored yet. */
  final: number | null;
  /** Which rule was applied. */
  rule: "manager" | "nonManager";
  /** For managers, the value Manan's field defaults to (copy-self), when enabled. */
  mananDefault: number | null;
}

/** Blend a single factor's (self, manager, manan) into the final per the rules. */
export function blendFactor(
  scores: RaterScores,
  isManager: boolean,
  cfg: PmsV3Config,
): BlendResult {
  const b = cfg.blend;
  if (isManager) {
    // Managers: Manan out of 100%. Default = copy the manager's own self score.
    const mananDefault = b.managerCopySelfDefault ? scores.self : null;
    const manan = scores.manan ?? mananDefault;
    return {
      final: manan == null ? null : manan * b.managerMananWeight,
      rule: "manager",
      mananDefault,
    };
  }
  // Non-managers: manager 50% + manan 50%. Both required for a final.
  if (scores.manager == null || scores.manan == null) {
    return { final: null, rule: "nonManager", mananDefault: null };
  }
  const final =
    scores.manager * b.nonManagerManagerWeight + scores.manan * b.nonManagerMananWeight;
  return { final, rule: "nonManager", mananDefault: null };
}

export interface PerceptionGap {
  self: number | null;
  manager: number | null;
  manan: number | null;
  /** self − manager (positive = self-rated higher than the manager). */
  selfVsManager: number | null;
  /** self − manan. */
  selfVsManan: number | null;
  /** Largest absolute divergence across the three, for a headline chip. */
  maxDivergence: number | null;
}

/** Build the perception-gap triple + divergences from the raw scores. */
export function perceptionGap(scores: RaterScores): PerceptionGap {
  const selfVsManager =
    scores.self != null && scores.manager != null ? scores.self - scores.manager : null;
  const selfVsManan =
    scores.self != null && scores.manan != null ? scores.self - scores.manan : null;
  const spreads = [selfVsManager, selfVsManan].filter((x): x is number => x != null).map(Math.abs);
  return {
    self: scores.self,
    manager: scores.manager,
    manan: scores.manan,
    selfVsManager,
    selfVsManan,
    maxDivergence: spreads.length ? Math.max(...spreads) : null,
  };
}
