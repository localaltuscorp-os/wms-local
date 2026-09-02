import type {
  EvaluationInstance,
  InterviewAiInsights,
  OverrideEvent,
  PassFail,
  RecommendationValue,
  TextboxId,
} from "@/lib/hr/candidate/evaluation-v2";
import type { ScoreContext, WeightProfile } from "@/lib/hr/candidate/evaluation-v2-scoring";

/**
 * The single mutation surface handed down to every section component. The screen
 * owns the instance + autosave; sections only call these typed setters. Keeps the
 * tree simple and avoids threading a dozen callbacks per section.
 */
export interface EvalController {
  instance: EvaluationInstance;
  profile: WeightProfile;
  /** Applicability context (isSalesRole) — decides gated/sales sections + composites. */
  ctx: ScoreContext;
  readOnly: boolean;
  setPassfail: (id: string, v: PassFail) => void;
  setRating: (id: string, v: number) => void;
  toggleCantSay: (id: string) => void;
  setNote: (id: string, v: string) => void;
  setSectionNote: (id: string, v: string) => void;
  /** Base Expectations — optional 0..10 confidence per item. */
  setConfidence: (id: string, v: number | null) => void;
  /** Technical Skills — "practically tested?" per item. */
  setPracticalTested: (id: string, v: boolean) => void;
  /** Customer-Facing (or any gate section) — store the gate answer. */
  setGate: (sectionId: string, v: string) => void;
  setOverall: (v: number) => void;
  /** Plain set (no override bookkeeping) — used by the deal-breaker "Mark Reject". */
  setRecommendation: (v: RecommendationValue) => void;
  /** Accept the auto-suggested recommendation — sets it and clears any override. */
  acceptRecommendation: (v: RecommendationValue) => void;
  /** Override the auto recommendation with a mandatory reason (audit-logged). */
  recordOverride: (event: OverrideEvent) => void;
  /** Store the generated / edited AI insight blob. */
  setAiInsights: (insights: InterviewAiInsights | null) => void;
  setTextbox: (id: TextboxId, v: string) => void;
}
