import {
  INCENTIVE_STATUS_LABELS,
  type IncentiveStatus,
  type IncentiveType,
} from "@/db/enums";

/**
 * INCENTIVE APPROVAL WORKFLOW — the rules, and only the rules.
 *
 * Pure and client-safe: no database, no session. The server actions enforce
 * every function here before writing (app/(app)/incentive/actions.ts), and the
 * review and resubmission screens render from the same functions, so the
 * buttons a reviewer sees and the decisions the server accepts cannot drift.
 *
 * ── TWO DECISION FLOWS ─────────────────────────────────────────────────────
 * Most incentives: Approved · Not Approved · Due · Not Due · Reversed.
 *
 * Published content — a Client Happiness request whose Happiness Type is a
 * LinkedIn Testimonial, an Interview or a Case Study — gets Publish · Revise ·
 * Not Approved instead, because the question for content is whether it can go
 * out as it is, not whether it is due.
 *
 * "Video Interview" in the brief is the stored `Interview` option: that is the
 * value the form has always offered, and there is no separate "Video Interview"
 * option to match. `Video Testimonial` is NOT in the set — the brief does not
 * name it — so it follows the normal flow. Moving it is one line below.
 *
 * ── WHAT THE RESULTING STATES MEAN HERE ────────────────────────────────────
 * Publish records Approved. Revise records Revision Requested. Not Approved is
 * stored as `rejected` (see db/enums.ts). Nothing in this module pays anyone,
 * changes a ledger or notifies Accounts — those are separate pieces of work.
 */

/** Happiness Types that are reviewed as publishable content. */
export const CONTENT_REVIEW_HAPPINESS_TYPES = [
  "LinkedIn Testimonial",
  "Interview",
  "Case Study",
] as const;

/** Is this request reviewed with Publish / Revise / Not Approved? */
export function isContentReviewRequest(
  type: IncentiveType | string,
  details: Record<string, string> | null | undefined,
): boolean {
  if (type !== "client_happiness") return false;
  const happiness = details && typeof details === "object" ? details.happiness_type : undefined;
  return (CONTENT_REVIEW_HAPPINESS_TYPES as readonly string[]).includes(happiness ?? "");
}

export const DECISION_ACTIONS = [
  "approve",
  "not_approve",
  "due",
  "not_due",
  "reverse",
  "publish",
  "revise",
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** The buttons, in the order the brief lists them. */
export const NORMAL_DECISIONS: readonly DecisionAction[] = ["approve", "not_approve", "due", "not_due", "reverse"];
export const CONTENT_DECISIONS: readonly DecisionAction[] = ["publish", "revise", "not_approve"];

/** What each decision leaves the request as. */
export const DECISION_RESULT: Record<DecisionAction, IncentiveStatus> = {
  approve: "approved",
  not_approve: "rejected",
  due: "due",
  not_due: "not_due",
  reverse: "reversed",
  publish: "approved",
  revise: "revision_requested",
};

export const DECISION_LABELS: Record<DecisionAction, string> = {
  approve: "Approved",
  not_approve: "Not Approved",
  due: "Due",
  not_due: "Not Due",
  // Same rename as the status it leads to (db/enums.ts): the reviewer's action
  // and the state it leaves behind must read as one thing.
  reverse: "Negative Payable Adjustment",
  publish: "Publish",
  revise: "Revise",
};

export function isDecisionAction(v: unknown): v is DecisionAction {
  return typeof v === "string" && (DECISION_ACTIONS as readonly string[]).includes(v);
}

/**
 * CONTROLLED TRANSITIONS — from each state, the decisions that may be made.
 *
 * Anything absent is refused. In particular:
 *   · Not Approved and Revision Requested have NO reviewer decisions. The next
 *     move belongs to the employee (Justify & Resubmit), which returns the
 *     request to Pending Approval.
 *   · Reversed is final.
 *   · Due and Not Due are open review states, so Manan can still settle them;
 *     Approved can only be Reversed.
 *   · Content requests are decided once, from Pending Approval.
 */
const NORMAL_TRANSITIONS: Partial<Record<IncentiveStatus, readonly DecisionAction[]>> = {
  pending: ["approve", "not_approve", "due", "not_due", "reverse"],
  due: ["approve", "not_approve", "not_due", "reverse"],
  not_due: ["approve", "not_approve", "due", "reverse"],
  approved: ["reverse"],
};

const CONTENT_TRANSITIONS: Partial<Record<IncentiveStatus, readonly DecisionAction[]>> = {
  pending: ["publish", "revise", "not_approve"],
};

/** The decisions available on this request right now, in button order. */
export function availableDecisions(
  type: IncentiveType | string,
  details: Record<string, string> | null | undefined,
  status: IncentiveStatus | string,
): readonly DecisionAction[] {
  const content = isContentReviewRequest(type, details);
  const table = content ? CONTENT_TRANSITIONS : NORMAL_TRANSITIONS;
  const allowed = table[status as IncentiveStatus] ?? [];
  const order = content ? CONTENT_DECISIONS : NORMAL_DECISIONS;
  return order.filter((a) => allowed.includes(a));
}

/** States that belong in the reviewer's "Needs your review" queue. */
export const REVIEW_QUEUE_STATUSES: readonly IncentiveStatus[] = ["pending", "due", "not_due"];

export function needsReview(status: IncentiveStatus | string): boolean {
  return (REVIEW_QUEUE_STATUSES as readonly string[]).includes(status);
}

// ── Notes ────────────────────────────────────────────────────────────────────

export const NOTE_MAX = 2000;

/** Decisions that cannot be submitted without saying why. */
export function decisionRequiresNote(action: DecisionAction): boolean {
  return action === "not_approve" || action === "reverse" || action === "revise";
}

/** The label on the note box for this decision. */
export function decisionNoteLabel(action: DecisionAction): string {
  if (action === "revise") return "Revision Note";
  if (decisionRequiresNote(action)) return "Reason / Notes";
  return "Notes";
}

/** The exact sentence shown when a required note is empty. */
export function decisionNoteRequiredMessage(action: DecisionAction): string {
  switch (action) {
    case "not_approve":
      return "Please provide a reason before marking this incentive as Not Approved.";
    case "reverse":
      return "Please provide a reason before recording a negative payable adjustment.";
    case "revise":
      return "Please add a revision note before asking for this incentive to be revised.";
    default:
      return "";
  }
}

/**
 * Validate one decision against the request's current state.
 *
 * Returns the state to write and the normalised note, or the sentence to show.
 * The server calls this inside the same transaction that writes the decision;
 * the review panel calls it to disable Submit and to show the message inline.
 */
export function checkDecision(input: {
  type: IncentiveType | string;
  details: Record<string, string> | null | undefined;
  status: IncentiveStatus | string;
  action: unknown;
  note?: string | null;
}):
  | { ok: true; action: DecisionAction; newStatus: IncentiveStatus; note: string | null }
  | { ok: false; error: string } {
  if (!isDecisionAction(input.action)) {
    return { ok: false, error: "Choose a decision." };
  }
  const action = input.action;

  const allowed = availableDecisions(input.type, input.details, input.status);
  if (!allowed.includes(action)) {
    const current = INCENTIVE_STATUS_LABELS[input.status as IncentiveStatus] ?? String(input.status);
    if (canResubmit(input.status)) {
      return {
        ok: false,
        error: `This incentive is ${current} and is waiting for the employee to justify and resubmit it.`,
      };
    }
    return {
      ok: false,
      error: `This incentive is ${current} — "${DECISION_LABELS[action]}" cannot be recorded on it now.`,
    };
  }

  const note = (input.note ?? "").trim();
  if (decisionRequiresNote(action) && !note) {
    return { ok: false, error: decisionNoteRequiredMessage(action) };
  }
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  }

  return { ok: true, action, newStatus: DECISION_RESULT[action], note: note || null };
}

// ── Resubmission ─────────────────────────────────────────────────────────────

/** States the employee can Justify & Resubmit from. */
export const RESUBMITTABLE_STATUSES: readonly IncentiveStatus[] = ["rejected", "revision_requested"];

export function canResubmit(status: IncentiveStatus | string): boolean {
  return (RESUBMITTABLE_STATUSES as readonly string[]).includes(status);
}

export const JUSTIFICATION_LABEL = "Justification / Resubmission Note";
export const JUSTIFICATION_REQUIRED_MESSAGE =
  "Please add a justification before resubmitting this incentive.";

/** Validate a resubmission's state and justification (the details are validated
 *  separately, by the same gate a new request goes through). */
export function checkResubmission(input: {
  status: IncentiveStatus | string;
  justification: string | null | undefined;
}): { ok: true; justification: string } | { ok: false; error: string } {
  if (!canResubmit(input.status)) {
    if (input.status === "pending") {
      return { ok: false, error: "This incentive is already awaiting review." };
    }
    const current = INCENTIVE_STATUS_LABELS[input.status as IncentiveStatus] ?? String(input.status);
    return {
      ok: false,
      error: `Only a Not Approved or Revision Requested incentive can be resubmitted — this one is ${current}.`,
    };
  }
  const justification = (input.justification ?? "").trim();
  if (!justification) return { ok: false, error: JUSTIFICATION_REQUIRED_MESSAGE };
  if (justification.length > NOTE_MAX) {
    return { ok: false, error: `Keep the justification under ${NOTE_MAX} characters.` };
  }
  return { ok: true, justification };
}

/** The state a resubmission always returns the request to. */
export const RESUBMITTED_STATUS: IncentiveStatus = "pending";
