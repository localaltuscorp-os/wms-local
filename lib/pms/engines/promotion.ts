/**
 * PMS Layer 2 — the PURE Promotion engine (mig 0095).
 *
 * evaluatePromotion() decides whether an employee is ELIGIBLE to be FLAGGED for
 * a promotion review. It is a pure function of (score, tenureDays, config):
 * the score floor and the minimum tenure both come from cfg.thresholds — no
 * literal threshold appears here.
 *
 * It only FLAGS (returns eligible + a rationale). It NEVER writes, NEVER auto-
 * promotes (Law 8). A human acts on the flag via pms_promotion_signal.
 */
import type { PmsScoreConfig } from "./config";

export interface PromotionEvaluation {
  eligible: boolean;
  rationale: string;
}

export function evaluatePromotion(
  score: number,
  tenureDays: number,
  cfg: PmsScoreConfig,
): PromotionEvaluation {
  const { promotionScore, minTenureDays } = cfg.thresholds;
  const scoreOk = score >= promotionScore;
  const tenureOk = tenureDays >= minTenureDays;
  const eligible = scoreOk && tenureOk;

  let rationale: string;
  if (eligible) {
    rationale = `Score ${score} ≥ ${promotionScore} and tenure ${tenureDays}d ≥ ${minTenureDays}d — eligible for a promotion review (leadership decides).`;
  } else if (!scoreOk && !tenureOk) {
    rationale = `Score ${score} < ${promotionScore} and tenure ${tenureDays}d < ${minTenureDays}d.`;
  } else if (!scoreOk) {
    rationale = `Score ${score} < ${promotionScore} (tenure ${tenureDays}d ok).`;
  } else {
    rationale = `Tenure ${tenureDays}d < ${minTenureDays}d (score ${score} ok).`;
  }
  return { eligible, rationale };
}
