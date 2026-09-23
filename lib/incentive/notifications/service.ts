import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  incentiveCatalogEvents,
  incentiveNotificationDeliveries,
} from "@/db/schema";
import type { IncentiveStatus, IncentiveType } from "@/db/enums";
import { resolveEmployeeType } from "@/lib/incentive/master";
import { localDateString } from "@/lib/format";
import { canReviewIncentives } from "@/lib/auth/incentive-permissions";
import { notify, type NotifyOpts } from "@/lib/notifications/dispatch";
import type { DecisionAction } from "@/lib/incentive/workflow";
import { INCENTIVE_NOTIFICATION_CHANNELS, encodeIncentiveMeta } from "./kinds";
import {
  buildCatalogNotification,
  buildDecisionNotification,
  buildPaidNotification,
  buildResubmissionNotification,
  type BuiltIncentiveNotification,
  type CatalogNotificationKind,
} from "./content";
import {
  diffCatalog,
  isActiveEmployee,
  normalizeSnapshot,
  planCatalogNotifications,
  type CatalogChange,
  type CatalogSnapshot,
} from "./eligibility";

/**
 * INCENTIVE NOTIFICATION SERVICE — the event layer between the Incentive
 * actions and the WMS notification system.
 *
 *   Incentive Master change  → recordIncentiveCatalogEvent (in the change's tx)
 *                            → processIncentiveCatalogEvent (after the response)
 *   Decision recorded        → notifyIncentiveDecision
 *   Justify & Resubmit       → notifyIncentiveResubmitted
 *   Accounts marked it paid  → notifyIncentivePaid
 *
 * The actions call these AFTER their own write has committed; nothing here can
 * undo, block or fail an incentive action. Every entry point catches and logs
 * its own errors and returns a result instead of throwing.
 *
 * Delivery is `notify()` — the in-app row, then email / push per the admin
 * matrix and the recipient's own preferences, with the existing dispatch log
 * and retry cron behind a failed email. This file adds only two things on top:
 *
 *   1. WHO. Recipients are resolved here, on the server, from the database:
 *      the request's own employee, the reviewer by the same permission rule the
 *      decision action enforces, or the employees eligible for an incentive.
 *      Inactive employees receive nothing. Each person gets their own
 *      notification and their own email — never a shared recipient list.
 *   2. ONCE. Each delivery is claimed in `incentive_notification_deliveries`
 *      (event type, subject, recipient, version) before it is sent. A retry,
 *      a refresh or a replayed event finds the claim and sends nothing.
 *
 * Nothing here is a server action and nothing is importable from the client
 * (`server-only`), so no request can ask for a notification to be generated.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export type IncentiveDispatcher = (opts: NotifyOpts) => Promise<void>;

export interface IncentiveNotifyContext {
  /** Run inside this transaction (used by the end-to-end verification). */
  tx?: Tx;
  /** Replace `notify()` — for verification without sending anything. */
  dispatch?: IncentiveDispatcher;
}

export type DeliveryResult = "sent" | "duplicate" | "inactive" | "failed";

export type DeliveryTally = Record<DeliveryResult, number>;

function tally(results: DeliveryResult[]): DeliveryTally {
  const t: DeliveryTally = { sent: 0, duplicate: 0, inactive: 0, failed: 0 };
  for (const r of results) t[r] += 1;
  return t;
}

const LOG = "[incentive-notify]";

// ── One delivery ─────────────────────────────────────────────────────────────

export interface DeliveryItem {
  built: BuiltIncentiveNotification;
  recipientId: string;
  /** The request / incentive / ledger row the notification is about. */
  subjectId: string;
  /** Identifies this occurrence of the event (a decision id, a change id …). */
  versionKey: string;
  actorId?: string | null;
}

export async function deliverIncentiveNotification(
  item: DeliveryItem,
  ctx: IncentiveNotifyContext = {},
): Promise<DeliveryResult> {
  const exec: Exec = ctx.tx ?? db;
  const kind = item.built.kind;
  try {
    const [recipient] = await exec
      .select({ isActive: employees.isActive, employmentStatus: employees.employmentStatus })
      .from(employees)
      .where(eq(employees.id, item.recipientId))
      .limit(1);
    if (!recipient || !isActiveEmployee(recipient)) return "inactive";

    const [claim] = await exec
      .insert(incentiveNotificationDeliveries)
      .values({
        eventType: kind,
        subjectId: item.subjectId,
        recipientId: item.recipientId,
        versionKey: item.versionKey,
      })
      .onConflictDoNothing()
      .returning({ id: incentiveNotificationDeliveries.id });
    if (!claim) return "duplicate";

    try {
      await (ctx.dispatch ?? notify)({
        userId: item.recipientId,
        kind,
        title: item.built.title,
        body: encodeIncentiveMeta(item.built.meta),
        actorId: item.actorId ?? null,
        channels: INCENTIVE_NOTIFICATION_CHANNELS,
      });
      return "sent";
    } catch (err) {
      // Nothing was delivered, so give the claim back: a genuine retry of the
      // same event must still be able to send it.
      console.error(`${LOG} ${kind} → ${item.recipientId} failed; claim released for retry:`, err);
      await exec
        .delete(incentiveNotificationDeliveries)
        .where(eq(incentiveNotificationDeliveries.id, claim.id))
        .catch((e: unknown) => console.error(`${LOG} could not release claim ${claim.id}:`, e));
      return "failed";
    }
  } catch (err) {
    console.error(`${LOG} ${kind} → ${item.recipientId} could not be processed:`, err);
    return "failed";
  }
}

async function deliverAll(items: DeliveryItem[], ctx: IncentiveNotifyContext): Promise<DeliveryTally> {
  const results: DeliveryResult[] = [];
  // A small fixed concurrency keeps a whole-company fan-out from tripping the
  // email provider's rate limit; inside a transaction there is one connection,
  // so go one at a time.
  const width = ctx.tx ? 1 : 3;
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++]!;
      results.push(await deliverIncentiveNotification(item, ctx));
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return tally(results);
}

async function nameOf(exec: Exec, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [row] = await exec.select({ name: employees.name }).from(employees).where(eq(employees.id, id)).limit(1);
  return row?.name ?? null;
}

// ── Workflow decisions ───────────────────────────────────────────────────────

export interface DecisionNotificationInput {
  requestId: string;
  employeeId: string;
  type: IncentiveType;
  details: Record<string, string>;
  submissionNo: number;
  action: DecisionAction;
  newStatus: IncentiveStatus;
  note: string | null;
  decisionId: string;
  decidedAt: Date;
  reviewerId: string;
}

/** Tell the employee about a decision on their request. */
export async function notifyIncentiveDecision(
  input: DecisionNotificationInput,
  ctx: IncentiveNotifyContext = {},
): Promise<DeliveryResult | "skipped"> {
  try {
    const exec: Exec = ctx.tx ?? db;
    const built = buildDecisionNotification({
      action: input.action,
      requestId: input.requestId,
      type: input.type,
      details: input.details,
      submissionNo: input.submissionNo,
      newStatus: input.newStatus,
      note: input.note,
      decidedAt: input.decidedAt,
      reviewerName: await nameOf(exec, input.reviewerId),
    });
    if (!built) {
      console.error(`${LOG} ${input.action} on ${input.requestId} has no reason recorded — notification not sent.`);
      return "skipped";
    }
    return await deliverIncentiveNotification(
      {
        built,
        recipientId: input.employeeId,
        subjectId: input.requestId,
        versionKey: `decision:${input.decisionId}`,
        actorId: input.reviewerId,
      },
      ctx,
    );
  } catch (err) {
    console.error(`${LOG} decision ${input.decisionId} could not be processed:`, err);
    return "failed";
  }
}

// ── Justify & Resubmit ───────────────────────────────────────────────────────

export interface ResubmissionNotificationInput {
  requestId: string;
  submissionId: string;
  submissionNo: number;
  employeeId: string;
  type: IncentiveType;
  details: Record<string, string>;
  justification: string | null;
  submittedAt: Date;
}

/** Tell the incentive reviewer a request is back in their queue. */
export async function notifyIncentiveResubmitted(
  input: ResubmissionNotificationInput,
  ctx: IncentiveNotifyContext = {},
): Promise<DeliveryTally> {
  try {
    const exec: Exec = ctx.tx ?? db;
    const people = await exec
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        isActive: employees.isActive,
        employmentStatus: employees.employmentStatus,
      })
      .from(employees);
    // The same rule the decision action enforces — whoever may decide is who
    // is told there is something to decide.
    const reviewers = people.filter(
      (p) => canReviewIncentives(p.email) && isActiveEmployee(p) && p.id !== input.employeeId,
    );
    if (reviewers.length === 0) {
      console.error(`${LOG} no active incentive reviewer to notify of resubmission ${input.submissionId}.`);
    }
    const built = buildResubmissionNotification({
      requestId: input.requestId,
      type: input.type,
      details: input.details,
      submissionNo: input.submissionNo,
      justification: input.justification,
      submittedAt: input.submittedAt,
      employeeName: people.find((p) => p.id === input.employeeId)?.name ?? null,
    });
    return await deliverAll(
      reviewers.map((r) => ({
        built,
        recipientId: r.id,
        subjectId: input.requestId,
        versionKey: `submission:${input.submissionId}`,
        actorId: input.employeeId,
      })),
      ctx,
    );
  } catch (err) {
    console.error(`${LOG} resubmission ${input.submissionId} could not be processed:`, err);
    return tally(["failed"]);
  }
}

// ── Incentive Master ─────────────────────────────────────────────────────────

/**
 * `catalogSnapshot` lives in ./eligibility.ts and is re-exported here.
 *
 * It is a PURE function — a database row in, the stored snapshot out — so it
 * belongs with the other snapshot rules rather than in this server-only module,
 * where nothing could unit-test it without faking a database. Re-exported so
 * every existing caller keeps one import.
 */
export { catalogSnapshot } from "./eligibility";

/**
 * Record an Incentive Master change. Call INSIDE the transaction that makes the
 * change, so the change and its event commit together. Returns the event id, or
 * null for an edit that changed nothing material (nothing to tell anyone).
 */
export async function recordIncentiveCatalogEvent(
  exec: Exec,
  input: {
    eventType: "created" | "updated" | "deleted";
    catalogId: string;
    before: CatalogSnapshot | null;
    after: CatalogSnapshot | null;
    actorId: string | null;
    /**
     * The date the change takes effect, when it is not today — an eligibility
     * grant or removal carries a date the admin chose, and the notice has to
     * say that date rather than the day the button was pressed. Omitted for an
     * ordinary field edit, which takes effect immediately.
     */
    effectiveDate?: string | null;
  },
): Promise<string | null> {
  const changes: CatalogChange[] =
    input.eventType === "updated" && input.before && input.after ? diffCatalog(input.before, input.after) : [];
  if (input.eventType === "updated" && changes.length === 0) return null;
  const name = (input.after ?? input.before)?.name;
  if (!name) return null;

  const [row] = await exec
    .insert(incentiveCatalogEvents)
    .values({
      catalogId: input.catalogId,
      catalogName: name,
      eventType: input.eventType,
      before: input.before,
      after: input.after,
      changes,
      actorId: input.actorId,
      effectiveDate: input.effectiveDate ?? null,
    })
    .returning({ id: incentiveCatalogEvents.id });
  return row?.id ?? null;
}

export type CatalogEventSummary = DeliveryTally & { event: string | null };

/** Fan one recorded Incentive Master change out to the people it affects. */
export async function processIncentiveCatalogEvent(
  eventId: string,
  ctx: IncentiveNotifyContext = {},
): Promise<CatalogEventSummary> {
  try {
    const exec: Exec = ctx.tx ?? db;
    const [ev] = await exec
      .select()
      .from(incentiveCatalogEvents)
      .where(eq(incentiveCatalogEvents.id, eventId))
      .limit(1);
    if (!ev) return { ...tally([]), event: null };

    // The audience is decided by the SAME rule as every other screen, so this
    // query provides the same two facts it needs about a person: their
    // effective employee type (an intern is never in an audience) and their
    // Function (what a FUNCTION-scoped scheme matches on).
    const people = await exec
      .select({
        id: employees.id,
        isActive: employees.isActive,
        employmentStatus: employees.employmentStatus,
        employeeTypeOverride: employees.employeeType,
        designationEmployeeType: designations.employeeType,
        functionId: employees.departmentId,
      })
      .from(employees)
      .leftJoin(designations, eq(employees.designationId, designations.id));

    const before = normalizeSnapshot(ev.before);
    const after = normalizeSnapshot(ev.after);
    const plan = planCatalogNotifications({
      eventType: ev.eventType,
      before,
      after,
      employees: people.map((p) => ({
        id: p.id,
        isActive: p.isActive,
        employmentStatus: p.employmentStatus,
        employeeType: resolveEmployeeType({
          override: p.employeeTypeOverride,
          designationType: p.designationEmployeeType,
        }),
        functionId: p.functionId,
      })),
      actorId: ev.actorId,
    });
    // The date the change takes effect: the one chosen when the change was
    // recorded (an eligibility grant or removal), else the change record's own
    // date in IST. Events written before migration 0232 have no column value,
    // which is exactly the fallback.
    const effectiveDate = ev.effectiveDate
      ? String(ev.effectiveDate).slice(0, 10)
      : localDateString("Asia/Kolkata", ev.createdAt);
    const changes = (Array.isArray(ev.changes) ? ev.changes : []) as CatalogChange[];

    const items: DeliveryItem[] = [];
    const add = (
      ids: string[],
      kind: CatalogNotificationKind,
      snapshot: CatalogSnapshot | null,
      newlyEligible = false,
    ) => {
      if (!snapshot || ids.length === 0) return;
      const built = buildCatalogNotification({ kind, snapshot, effectiveDate, changes, newlyEligible });
      for (const id of ids) {
        items.push({
          built,
          recipientId: id,
          subjectId: ev.catalogId ?? ev.id,
          versionKey: `catalog-event:${ev.id}`,
          actorId: ev.actorId,
        });
      }
    };
    add(plan.created, "incentive_created", after);
    add(plan.newlyEligible, "incentive_created", after, true);
    add(plan.updated, "incentive_updated", after);
    add(plan.removed, "incentive_eligibility_removed", after ?? before);
    add(plan.deleted, "incentive_deleted", before);

    return { ...(await deliverAll(items, ctx)), event: ev.eventType };
  } catch (err) {
    console.error(`${LOG} catalog event ${eventId} could not be processed:`, err);
    return { ...tally(["failed"]), event: null };
  }
}

// ── Payment ──────────────────────────────────────────────────────────────────

export interface PaidNotificationInput {
  employeeId: string | null;
  /** The ledger row that was paid. */
  subjectId: string;
  /** What makes this payment distinct — a payout event id, or the paid total. */
  versionKey: string;
  label: string | null;
  amount: number;
  paidDate: string | null;
  periodMonth: string | null;
  actorId: string | null;
}

/** Tell an employee their incentive was paid. Unlinked ledger rows (no
 *  employee id — the ledger is partly keyed by name) have no one to tell. */
export async function notifyIncentivePaid(
  input: PaidNotificationInput,
  ctx: IncentiveNotifyContext = {},
): Promise<DeliveryResult | "skipped"> {
  if (!input.employeeId || !(input.amount > 0)) return "skipped";
  try {
    return await deliverIncentiveNotification(
      {
        built: buildPaidNotification({
          label: input.label,
          amount: Math.round(input.amount * 100) / 100,
          paidDate: input.paidDate,
          periodMonth: input.periodMonth,
        }),
        recipientId: input.employeeId,
        subjectId: input.subjectId,
        versionKey: input.versionKey,
        actorId: input.actorId,
      },
      ctx,
    );
  } catch (err) {
    console.error(`${LOG} payment ${input.versionKey} could not be processed:`, err);
    return "failed";
  }
}

export async function notifyIncentivesPaid(
  inputs: PaidNotificationInput[],
  ctx: IncentiveNotifyContext = {},
): Promise<void> {
  for (const input of inputs) await notifyIncentivePaid(input, ctx);
}
