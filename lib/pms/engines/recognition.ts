/**
 * PMS Layer 2 — the PURE Recognition engine (mig 0095).
 *
 * suggestRecognition() flags people whose score crosses cfg.thresholds
 * .recognitionScore as candidates for recognition. Pure function of (ranked
 * scores, config): the recognition floor comes from cfg.thresholds — no literal
 * threshold appears here.
 *
 * It only SUGGESTS (returns candidates + a reason). It NEVER writes, NEVER auto-
 * releases (Law 8). A human releases/dismisses via pms_recognition.
 */
import type { PmsScoreConfig } from "./config";

export interface RankedScore {
  employeeId: string;
  score: number;
}

export interface RecognitionSuggestion {
  employeeId: string;
  kind: string; // 'top_performer' | 'high_score'
  reason: string;
  scoreSnapshot: number;
}

/**
 * Suggest recognitions from a ranked list of scores. Everyone at/above the
 * configured recognition floor is a candidate; the single highest scorer above
 * the floor is additionally tagged the top performer. PURE.
 */
export function suggestRecognition(
  ranked: RankedScore[],
  cfg: PmsScoreConfig,
): RecognitionSuggestion[] {
  const floor = cfg.thresholds.recognitionScore;
  const qualifying = ranked
    .filter((r) => r.score >= floor)
    .sort((a, b) => b.score - a.score);
  if (qualifying.length === 0) return [];

  const topId = qualifying[0]!.employeeId;
  return qualifying.map((r) => ({
    employeeId: r.employeeId,
    kind: r.employeeId === topId ? "top_performer" : "high_score",
    reason:
      r.employeeId === topId
        ? `Highest score ${r.score} (≥ recognition floor ${floor}).`
        : `Score ${r.score} ≥ recognition floor ${floor}.`,
    scoreSnapshot: r.score,
  }));
}
