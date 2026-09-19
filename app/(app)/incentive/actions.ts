"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveRequests } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canReviewIncentives, INCENTIVE_REVIEWER_NAME } from "@/lib/auth/incentive-permissions";
import { rateLimitOrError } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/after";
import type { IncentiveRequestInput } from "@/lib/incentive-fields";
import { prepareIncentiveRequest } from "@/lib/incentive/prepare-request";
import { DECISION_ACTIONS, NOTE_MAX, checkResubmission, type DecisionAction } from "@/lib/incentive/workflow";
import {
  fileIncentiveRequest,
  loadIncentiveRequestHistory,
  recordIncentiveDecision,
  resubmitIncentive,
  type IncentiveRequestHistory,
} from "@/lib/incentive/workflow-server";
import {
  notifyIncentiveDecision,
  notifyIncentiveResubmitted,
} from "@/lib/incentive/notifications/service";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * File a new incentive request (any signed-in employee, for themselves).
 *
 * Every rule — required fields, mobile numbers, emails, the Conversion product,
 * client permission, incentive date, split shares — is enforced by
 * `prepareIncentiveRequest`, the same gate POST /api/mobile/incentive uses. The
 * dialog validates first for the inline messages; this does not trust it.
 *
 * It lands as Pending Approval with its Submission 1 snapshot, in one
 * transaction (lib/incentive/workflow-server.ts).
 */
export async function createIncentiveRequest(
  input: IncentiveRequestInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const prepared = await prepareIncentiveRequest(me.id, input);
  if (!prepared.ok) return prepared;

  let inserted: { id: string };
  try {
    inserted = await fileIncentiveRequest(prepared.values);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/incentive");
  return { ok: true, id: inserted.id };
}

const DecideSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(DECISION_ACTIONS),
    // Bounded generously here; the real limit and the "reason required" rule
    // are `checkDecision`'s, so the message is the same one the panel shows.
    note: z.string().max(NOTE_MAX * 2).optional(),
  })
  .strict();

/**
 * MANAN VASA'S DECISION on an incentive request.
 *
 * ── WHO ────────────────────────────────────────────────────────────────────
 * Only Manan (`canReviewIncentives`), checked HERE on every call — not "any
 * admin". This used to be `requireAdmin()` with a free approved/rejected verdict
 * that could re-decide anything at any time; that was exactly the arbitrary
 * status change the approval workflow exists to stop, so it now runs through
 * the controlled transitions in lib/incentive/workflow.ts.
 *
 * ── WHAT ───────────────────────────────────────────────────────────────────
 * The decision, its reason where one is required, and the audit row are written
 * together (`recordIncentiveDecision`). Refused decisions change nothing.
 *
 * ── NOTIFICATION ───────────────────────────────────────────────────────────
 * After the decision commits, the employee is notified in-app and by email for
 * every outcome (Approved, Published, Not Approved with the reason, Revision
 * Required with the note, Due, Reversed with the reason; Not Due in-app only),
 * after the response and exactly once per decision — see
 * lib/incentive/notifications/service.ts. A delivery failure is logged and can
 * never undo or fail the decision.
 */
export async function decideIncentiveRequest(input: {
  id: string;
  action: DecisionAction;
  note?: string;
}): Promise<ActionResult<{ newStatus: string }>> {
  const me = await requireUser();
  if (!canReviewIncentives(me.email)) {
    return { ok: false, error: `Only ${INCENTIVE_REVIEWER_NAME} can decide incentive requests.` };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let outcome: Awaited<ReturnType<typeof recordIncentiveDecision>>;
  try {
    outcome = await recordIncentiveDecision({
      requestId: parsed.data.id,
      action: parsed.data.action,
      note: parsed.data.note ?? null,
      reviewerId: me.id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!outcome.ok) return outcome;

  const decided = outcome;
  afterResponse(() => notifyIncentiveDecision(decided));

  revalidatePath("/incentive");
  return { ok: true, newStatus: outcome.newStatus };
}

const ResubmitSchema = z
  .object({
    id: z.string().uuid(),
    details: z.record(z.string(), z.string()),
    split: z
      .array(z.object({ employeeId: z.string().max(64), pct: z.number() }).strict())
      .max(20)
      .nullable()
      .optional(),
    justification: z.string().max(NOTE_MAX * 2),
  })
  .strict();

/**
 * JUSTIFY & RESUBMIT — the employee's answer to Not Approved or Revise.
 *
 * Only the request's own employee, only from Not Approved or Revision
 * Requested, only with a justification, and only with details that pass the
 * same gate a brand-new request does. The previous version and its decision
 * stay in the history; the request returns to Pending Approval as its next
 * submission.
 *
 * The incentive TYPE is taken from the stored request, never from the client:
 * a resubmission revises a request, it does not turn it into another one.
 *
 * Once committed, the incentive reviewer is notified that it is back in their
 * queue (once per submission, after the response).
 */
export async function resubmitIncentiveRequest(input: {
  id: string;
  details: Record<string, string>;
  split?: { employeeId: string; pct: number }[] | null;
  justification: string;
}): Promise<ActionResult<{ submissionNo: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ResubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [row] = await db
    .select({
      employeeId: incentiveRequests.employeeId,
      type: incentiveRequests.type,
      status: incentiveRequests.status,
    })
    .from(incentiveRequests)
    .where(eq(incentiveRequests.id, parsed.data.id));
  // Someone else's request reads as not found: whether it exists is not theirs
  // to learn.
  if (!row || row.employeeId !== me.id) {
    return { ok: false, error: "That incentive request was not found." };
  }

  // State and justification first, so the employee is told the real reason
  // rather than a field error on a request they cannot resubmit anyway.
  const early = checkResubmission({ status: row.status, justification: parsed.data.justification });
  if (!early.ok) return early;

  const prepared = await prepareIncentiveRequest(me.id, {
    type: row.type,
    details: parsed.data.details,
    split: parsed.data.split ?? null,
  });
  if (!prepared.ok) return prepared;

  let res: Awaited<ReturnType<typeof resubmitIncentive>>;
  try {
    res = await resubmitIncentive({
      requestId: parsed.data.id,
      actorId: me.id,
      prepared: prepared.values,
      justification: parsed.data.justification,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!res.ok) return res;

  const resubmitted = {
    requestId: parsed.data.id,
    submissionId: res.submissionId,
    submissionNo: res.submissionNo,
    employeeId: me.id,
    type: row.type,
    details: prepared.values.details,
    justification: early.justification,
    submittedAt: res.submittedAt,
  };
  afterResponse(() => notifyIncentiveResubmitted(resubmitted));

  revalidatePath("/incentive");
  return { ok: true, submissionNo: res.submissionNo };
}

/**
 * Every submission and decision of one request.
 *
 * Visible to the request's own employee, to Manan, and to admins — the same
 * people who can already see the request itself in the Requests list.
 */
export async function getIncentiveRequestHistory(
  id: string,
): Promise<ActionResult<{ history: IncentiveRequestHistory }>> {
  const me = await requireUser();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Invalid request" };

  const [row] = await db
    .select({ employeeId: incentiveRequests.employeeId })
    .from(incentiveRequests)
    .where(eq(incentiveRequests.id, parsedId.data));
  const allowed = !!row && (row.employeeId === me.id || me.isAdmin || canReviewIncentives(me.email));
  if (!allowed) return { ok: false, error: "That incentive request was not found." };

  const history = await loadIncentiveRequestHistory(parsedId.data);
  return { ok: true, history };
}
