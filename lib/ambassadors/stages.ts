/**
 * Ambassador referral pipeline — stage definitions, ordering, labels, tones,
 * and transition validation. Client-safe (no server imports) so both the
 * kanban board and server actions can share it.
 */

export const STAGES = [
  "received",
  "assigned",
  "qualified",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "payment",
  "commission_generated",
  "commission_paid",
  "lost",
] as const;

export type Stage = (typeof STAGES)[number];

/** The linear "happy path" (excludes the terminal `lost`). */
export const PIPELINE_STAGES: Stage[] = STAGES.filter((s) => s !== "lost");

export const STAGE_LABELS: Record<Stage, string> = {
  received: "Received",
  assigned: "Assigned",
  qualified: "Qualified",
  meeting: "Meeting",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  payment: "Payment",
  commission_generated: "Commission generated",
  commission_paid: "Commission paid",
  lost: "Lost",
};

/**
 * A brand-token tone key per stage (consumed by the board/pill components,
 * which map these to the Altus palette — green for wins, red for lost, neutral
 * for in-flight, with a warming gradient as the deal advances).
 */
export type StageTone = "neutral" | "progress" | "warm" | "win" | "money" | "lost";

export const STAGE_TONES: Record<Stage, StageTone> = {
  received: "neutral",
  assigned: "neutral",
  qualified: "progress",
  meeting: "progress",
  proposal: "warm",
  negotiation: "warm",
  won: "win",
  payment: "money",
  commission_generated: "money",
  commission_paid: "money",
  lost: "lost",
};

/** Stages at/after which the deal counts as converted (a sale happened). */
export const WON_STAGES: Stage[] = ["won", "payment", "commission_generated", "commission_paid"];

export function isWonStage(stage: Stage): boolean {
  return WON_STAGES.includes(stage);
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export interface TransitionContext {
  /** Deal amount currently on the referral (rupees), if any. */
  dealAmount: number | null;
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a stage change. Rules:
 *  - The target must be a real stage.
 *  - Moving INTO a won/converted stage requires a positive `dealAmount`
 *    (you can't book commission on an unknown deal size).
 *  - `lost` is reachable from any non-terminal stage.
 * Re-ordering within the pipeline (forward or backward) is otherwise allowed —
 * sales reality is messy and we don't want to trap a mis-click.
 */
export function validateTransition(
  from: Stage,
  to: Stage,
  ctx: TransitionContext,
): TransitionResult {
  if (!STAGES.includes(to)) return { ok: false, error: `Unknown stage "${to}".` };
  if (from === to) return { ok: true };
  if (isWonStage(to) && !(ctx.dealAmount && ctx.dealAmount > 0)) {
    return { ok: false, error: "Add the deal amount before marking this referral won." };
  }
  return { ok: true };
}
