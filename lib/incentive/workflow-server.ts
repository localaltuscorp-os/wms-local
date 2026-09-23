import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  employees,
  incentiveRequestDecisions,
  incentiveRequestSubmissions,
  incentiveRequests,
} from "@/db/schema";
import type { IncentiveStatus, IncentiveType } from "@/db/enums";
import { auditAction } from "@/lib/logs/audit";
import type { LogEventType } from "@/lib/logs/events";
import type { PreparedIncentiveRequest } from "@/lib/incentive/prepare-request";
import type { IncentiveSplitShare } from "@/lib/incentive/split";
import {
  RESUBMITTED_STATUS,
  checkDecision,
  checkResubmission,
  type DecisionAction,
} from "@/lib/incentive/workflow";

/**
 * INCENTIVE WORKFLOW — the database half.
 *
 * Every write the approval workflow makes goes through one of the three
 * functions here, and each one is a single transaction that changes the live
 * request AND appends its history row together. There is no way to move a
 * request's status without leaving the audit entry, because both happen in the
 * same commit or neither does.
 *
 * AUTHORISATION IS NOT HERE. The server actions decide WHO may call these
 * (Manan for decisions, the owner for resubmission). These decide whether the
 * move is legal for the request as it stands, re-checked under a row lock so
 * two reviewers — or a reviewer and a resubmitting employee — cannot both act on
 * the same version.
 *
 * Each accepts an optional transaction so a caller can compose them (and so the
 * workflow can be exercised end to end inside a transaction that is rolled
 * back, without touching live data).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function inTx<T>(tx: Tx | undefined, fn: (t: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : db.transaction(fn);
}

const STALE =
  "This incentive changed while you were looking at it — reload the page and review it again.";

// ── File a new request ───────────────────────────────────────────────────────

/**
 * Insert a new request as Pending Approval, with its Submission 1 snapshot.
 * Both entry points (the web action and POST /api/mobile/incentive) use this,
 * so no request can exist without the start of its history.
 */
export async function fileIncentiveRequest(
  values: PreparedIncentiveRequest,
  opts: { tx?: Tx } = {},
): Promise<{ id: string }> {
  return inTx(opts.tx, async (t) => {
    const [row] = await t
      .insert(incentiveRequests)
      .values({ ...values, status: "pending", submissionNo: 1 })
      .returning({ id: incentiveRequests.id });
    if (!row) throw new Error("insert returned no row");
    await t.insert(incentiveRequestSubmissions).values({
      requestId: row.id,
      submissionNo: 1,
      type: values.type,
      details: values.details,
      split: values.split,
      justification: null,
      submittedById: values.employeeId,
    });
    return { id: row.id };
  });
}

// ── Record a decision ────────────────────────────────────────────────────────

export interface DecisionOutcome {
  requestId: string;
  employeeId: string;
  type: IncentiveType;
  details: Record<string, string>;
  submissionNo: number;
  action: DecisionAction;
  previousStatus: IncentiveStatus;
  newStatus: IncentiveStatus;
  note: string | null;
  /** The audit row this decision wrote, and when — the decision's identity. */
  decisionId: string;
  decidedAt: Date;
  reviewerId: string;
}

/**
 * Apply one reviewer decision.
 *
 * The request is read FOR UPDATE, the decision is validated against the state
 * it is actually in (lib/incentive/workflow.ts `checkDecision`), and the update
 * is guarded on that same state and submission number, so a decision made
 * against a version that has since changed writes nothing.
 */
export async function recordIncentiveDecision(
  input: { requestId: string; action: unknown; note?: string | null; reviewerId: string },
  opts: { tx?: Tx } = {},
): Promise<({ ok: true } & DecisionOutcome) | { ok: false; error: string }> {
  const result = await inTx(opts.tx, async (t) => {
    const [row] = await t
      .select({
        id: incentiveRequests.id,
        employeeId: incentiveRequests.employeeId,
        type: incentiveRequests.type,
        status: incentiveRequests.status,
        details: incentiveRequests.details,
        submissionNo: incentiveRequests.submissionNo,
      })
      .from(incentiveRequests)
      .where(eq(incentiveRequests.id, input.requestId))
      .for("update");
    if (!row) return { ok: false as const, error: "That incentive request no longer exists." };

    const check = checkDecision({
      type: row.type,
      details: row.details,
      status: row.status,
      action: input.action,
      note: input.note,
    });
    if (!check.ok) return check;

    const now = new Date();
    const updated = await t
      .update(incentiveRequests)
      .set({
        status: check.newStatus,
        decidedById: input.reviewerId,
        decidedAt: now,
        decisionNote: check.note,
        updatedAt: now,
      })
      .where(
        and(
          eq(incentiveRequests.id, row.id),
          eq(incentiveRequests.status, row.status),
          eq(incentiveRequests.submissionNo, row.submissionNo),
        ),
      )
      .returning({ id: incentiveRequests.id });
    if (updated.length === 0) return { ok: false as const, error: STALE };

    const [audit] = await t
      .insert(incentiveRequestDecisions)
      .values({
        requestId: row.id,
        employeeId: row.employeeId,
        submissionNo: row.submissionNo,
        previousStatus: row.status,
        newStatus: check.newStatus,
        action: check.action,
        reviewerId: input.reviewerId,
        note: check.note,
        createdAt: now,
      })
      .returning({ id: incentiveRequestDecisions.id });
    if (!audit) throw new Error("decision audit insert returned no row");

    return {
      decisionId: audit.id,
      decidedAt: now,
      reviewerId: input.reviewerId,
      ok: true as const,
      requestId: row.id,
      employeeId: row.employeeId,
      type: row.type as IncentiveType,
      details: row.details,
      submissionNo: row.submissionNo,
      action: check.action,
      previousStatus: row.status,
      newStatus: check.newStatus,
      note: check.note,
    };
  });

  // The decision committed; mirror it into the global Logs feed. Fired after the
  // transaction so a log failure can never roll a decision back.
  if (result.ok) {
    auditAction({
      eventType: decisionEventType(result.action),
      employeeId: result.reviewerId,
      route: "/incentive",
      module: "Incentive",
      page: "Incentive Requests",
      resourceType: "incentive_request",
      resourceId: result.requestId,
      resourceName: result.type,
      action: result.action,
      status: "SUCCESS",
      reason: result.note,
      changes: [{ field: "Status", before: result.previousStatus, after: result.newStatus }],
      sessionCounters: { actions: 1 },
    });
  }

  return result;
}

/** Map a workflow decision onto the log event vocabulary. */
function decisionEventType(action: DecisionAction): LogEventType {
  switch (action) {
    case "approve":
      return "APPROVE";
    case "not_approve":
      return "REJECT";
    case "reverse":
      return "REVERSE";
    case "publish":
      return "PUBLISH";
    case "revise":
      return "REJECT";
    default:
      return "UPDATE";
  }
}

// ── Justify & Resubmit ───────────────────────────────────────────────────────

/**
 * Resubmit a Not Approved / Revision Requested request as its next version.
 *
 * `prepared` must already have passed `prepareIncentiveRequest` — the same gate
 * a new request goes through, so a resubmission cannot smuggle in details a
 * fresh request would be refused for.
 *
 * The live row takes the new details and returns to Pending Approval; the
 * previous version is untouched in `incentive_request_submissions`, and its
 * decision is untouched in `incentive_request_decisions`. The latest-decision
 * cache on the live row is cleared, because it described the version that has
 * just been replaced — the history still has it.
 */
export async function resubmitIncentive(
  input: {
    requestId: string;
    actorId: string;
    prepared: PreparedIncentiveRequest;
    justification: string | null | undefined;
  },
  opts: { tx?: Tx } = {},
): Promise<
  { ok: true; submissionNo: number; submissionId: string; submittedAt: Date } | { ok: false; error: string }
> {
  return inTx(opts.tx, async (t) => {
    const [row] = await t
      .select({
        id: incentiveRequests.id,
        employeeId: incentiveRequests.employeeId,
        type: incentiveRequests.type,
        status: incentiveRequests.status,
        submissionNo: incentiveRequests.submissionNo,
      })
      .from(incentiveRequests)
      .where(eq(incentiveRequests.id, input.requestId))
      .for("update");
    if (!row) return { ok: false as const, error: "That incentive request no longer exists." };

    // Ownership is checked by the action too; repeated here so this function is
    // safe to call on its own.
    if (row.employeeId !== input.actorId || input.prepared.employeeId !== input.actorId) {
      return { ok: false as const, error: "You can only resubmit your own incentive request." };
    }
    if (input.prepared.type !== row.type) {
      return {
        ok: false as const,
        error: "A resubmission keeps its incentive type — file a new request for a different type.",
      };
    }

    const check = checkResubmission({ status: row.status, justification: input.justification });
    if (!check.ok) return check;

    const nextNo = row.submissionNo + 1;
    const now = new Date();
    const updated = await t
      .update(incentiveRequests)
      .set({
        details: input.prepared.details,
        split: input.prepared.split,
        status: RESUBMITTED_STATUS,
        submissionNo: nextNo,
        resubmittedAt: now,
        decidedById: null,
        decidedAt: null,
        decisionNote: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(incentiveRequests.id, row.id),
          eq(incentiveRequests.status, row.status),
          eq(incentiveRequests.submissionNo, row.submissionNo),
        ),
      )
      .returning({ id: incentiveRequests.id });
    if (updated.length === 0) return { ok: false as const, error: STALE };

    const [submission] = await t
      .insert(incentiveRequestSubmissions)
      .values({
        requestId: row.id,
        submissionNo: nextNo,
        type: row.type,
        details: input.prepared.details,
        split: input.prepared.split,
        justification: check.justification,
        submittedById: input.actorId,
        submittedAt: now,
      })
      .returning({ id: incentiveRequestSubmissions.id });
    if (!submission) throw new Error("submission insert returned no row");

    return { ok: true as const, submissionNo: nextNo, submissionId: submission.id, submittedAt: now };
  });
}

// ── History ──────────────────────────────────────────────────────────────────

export interface IncentiveSubmissionEntry {
  submissionNo: number;
  type: IncentiveType;
  details: Record<string, string>;
  split: IncentiveSplitShare[] | null;
  justification: string | null;
  submittedByName: string | null;
  submittedAt: Date;
}

export interface IncentiveDecisionEntry {
  submissionNo: number;
  action: DecisionAction | "legacy";
  previousStatus: IncentiveStatus;
  newStatus: IncentiveStatus;
  reviewerName: string | null;
  note: string | null;
  createdAt: Date;
}

export interface IncentiveRequestHistory {
  submissions: IncentiveSubmissionEntry[];
  decisions: IncentiveDecisionEntry[];
}

/** Every version and every decision of one request, oldest first. */
export async function loadIncentiveRequestHistory(
  requestId: string,
  opts: { tx?: Tx } = {},
): Promise<IncentiveRequestHistory> {
  const exec = opts.tx ?? db;
  const submitter = alias(employees, "submitter");
  const reviewer = alias(employees, "reviewer");

  const [submissions, decisions] = await Promise.all([
    exec
      .select({
        submissionNo: incentiveRequestSubmissions.submissionNo,
        type: incentiveRequestSubmissions.type,
        details: incentiveRequestSubmissions.details,
        split: incentiveRequestSubmissions.split,
        justification: incentiveRequestSubmissions.justification,
        submittedByName: submitter.name,
        submittedAt: incentiveRequestSubmissions.submittedAt,
      })
      .from(incentiveRequestSubmissions)
      .leftJoin(submitter, eq(incentiveRequestSubmissions.submittedById, submitter.id))
      .where(eq(incentiveRequestSubmissions.requestId, requestId))
      .orderBy(asc(incentiveRequestSubmissions.submissionNo)),
    exec
      .select({
        submissionNo: incentiveRequestDecisions.submissionNo,
        action: incentiveRequestDecisions.action,
        previousStatus: incentiveRequestDecisions.previousStatus,
        newStatus: incentiveRequestDecisions.newStatus,
        reviewerName: reviewer.name,
        note: incentiveRequestDecisions.note,
        createdAt: incentiveRequestDecisions.createdAt,
      })
      .from(incentiveRequestDecisions)
      .leftJoin(reviewer, eq(incentiveRequestDecisions.reviewerId, reviewer.id))
      .where(eq(incentiveRequestDecisions.requestId, requestId))
      .orderBy(asc(incentiveRequestDecisions.createdAt)),
  ]);

  return {
    submissions: submissions.map((s) => ({
      ...s,
      type: s.type as IncentiveType,
      split: s.split ?? null,
      submittedByName: s.submittedByName ?? null,
    })),
    decisions: decisions.map((d) => ({ ...d, reviewerName: d.reviewerName ?? null })),
  };
}
