import type { NotificationKind } from "@/db/schema";
import type { DecisionAction } from "@/lib/incentive/workflow";

/**
 * INCENTIVE NOTIFICATIONS — the vocabulary. Pure and client-safe.
 *
 * Incentive notifications ride the EXISTING notification system: every one is a
 * `notifications` row created by `notify()` (lib/notifications/dispatch.ts),
 * shown in the Inbox, and emailed through `sendNotificationEmail` → the shared
 * `IncentiveNoticeEmail` template. Nothing here sends anything.
 *
 * The row's `body` carries a small JSON payload (`IncentiveNotificationMeta`).
 * It is the single source for everything rendered later — the Inbox line, the
 * push banner, the email — so a retried email (lib/notifications/retry.ts)
 * renders exactly what the first attempt would have, from the row alone.
 */

export const INCENTIVE_NOTIFICATION_KINDS = [
  // Incentive Master (Incentive Table) changes → eligible employees.
  "incentive_created",
  "incentive_updated",
  "incentive_eligibility_removed",
  "incentive_deleted",
  // Approval workflow decisions → the employee who filed the request.
  "incentive_request_approved",
  "incentive_request_published",
  "incentive_request_not_approved",
  "incentive_request_revision",
  "incentive_request_due",
  "incentive_request_not_due",
  "incentive_request_reversed",
  // Justify & Resubmit → the incentive reviewer (Manan Vasa).
  "incentive_request_resubmitted",
  // Accounts marked the incentive paid → the employee.
  "incentive_paid",
] as const satisfies readonly NotificationKind[];

export type IncentiveNotificationKind = (typeof INCENTIVE_NOTIFICATION_KINDS)[number];

export function isIncentiveNotificationKind(kind: string): kind is IncentiveNotificationKind {
  return (INCENTIVE_NOTIFICATION_KINDS as readonly string[]).includes(kind);
}

/** The kind a workflow decision produces. The workflow status is the source of
 *  truth — this only names the notification for the action already recorded. */
export const DECISION_NOTIFICATION_KIND: Record<DecisionAction, IncentiveNotificationKind> = {
  approve: "incentive_request_approved",
  publish: "incentive_request_published",
  not_approve: "incentive_request_not_approved",
  revise: "incentive_request_revision",
  due: "incentive_request_due",
  not_due: "incentive_request_not_due",
  reverse: "incentive_request_reversed",
};

/**
 * Channels incentive notifications use: the in-app row (always), email and
 * push. Slack and WhatsApp have no registered incentive templates, so they are
 * left out rather than sent a task-shaped message. This narrows the admin
 * notification matrix; it never widens it.
 */
export const INCENTIVE_NOTIFICATION_CHANNELS = ["email", "push"] as const;

export interface IncentiveChangeLine {
  label: string;
  from: string;
  to: string;
}

/** The JSON stored in `notifications.body` for every incentive kind. */
export interface IncentiveNotificationMeta {
  v: 1;
  /** One-line message for the Inbox row and the push banner. */
  summary: string;
  /** In-app destination — always an /incentive path (see `safeIncentiveHref`). */
  href: string;

  // ── request events ──
  requestId?: string;
  reference?: string;
  typeLabel?: string;
  incentiveDate?: string | null;
  amount?: number | null;
  statusLabel?: string;
  /** ISO time the decision / resubmission happened. */
  eventAt?: string;
  /** Who acted: the reviewer for decisions, the employee for resubmissions. */
  actorName?: string | null;
  /** The reason, revision note or reversal reason, verbatim. */
  note?: string | null;
  submissionNo?: number;
  employeeName?: string | null;
  justification?: string | null;
  details?: [string, string][];

  // ── Incentive Master events ──
  incentiveName?: string;
  /** The product the incentive is tied to, by NAME as at the change (0232). */
  productName?: string;
  /** "Permanent" / "One-Time" (0232). */
  durationLabel?: string;
  eligibleGroups?: string;
  description?: string | null;
  /** YYYY-MM-DD the change took effect (the change record's own date). */
  effectiveDate?: string;
  validUntil?: string | null;
  changes?: IncentiveChangeLine[];
  newlyEligible?: boolean;

  // ── payment ──
  paidDate?: string | null;
  periodMonth?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_HREF_RE = /^\/incentive(?:\?[A-Za-z0-9=&_.-]*)?$/;

export const INCENTIVE_HOME_HREF = "/incentive";
/** Opens the Incentive page with the Incentive Table dialog open. */
export const INCENTIVE_TABLE_HREF = "/incentive?view=table";

/** Opens the Incentive page on the Requests tab with this request expanded. */
export function incentiveRequestHref(requestId: string): string {
  return UUID_RE.test(requestId) ? `/incentive?request=${requestId.toLowerCase()}` : INCENTIVE_HOME_HREF;
}

/**
 * An href read back from a stored body is only ever followed if it is an
 * /incentive path. A tampered or malformed body degrades to the Incentive page;
 * it can never become an off-site or javascript: link.
 */
export function safeIncentiveHref(href: unknown): string {
  return typeof href === "string" && SAFE_HREF_RE.test(href) ? href : INCENTIVE_HOME_HREF;
}

/** Short human reference for a request, e.g. INC-1FBC08FF. */
export function incentiveReference(requestId: string): string {
  return `INC-${requestId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function encodeIncentiveMeta(meta: IncentiveNotificationMeta): string {
  return JSON.stringify(meta);
}

/** Parse a stored body. Anything that is not a v1 incentive payload is null. */
export function parseIncentiveMeta(body: string | null | undefined): IncentiveNotificationMeta | null {
  if (!body) return null;
  const t = body.trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Partial<IncentiveNotificationMeta> | null;
    if (!o || typeof o !== "object" || o.v !== 1 || typeof o.summary !== "string") return null;
    return { ...o, v: 1, summary: o.summary, href: safeIncentiveHref(o.href) } as IncentiveNotificationMeta;
  } catch {
    return null;
  }
}

/** Where clicking an incentive notification goes; null for any other kind. */
export function incentiveNotificationHref(kind: string, body: string | null | undefined): string | null {
  if (!isIncentiveNotificationKind(kind)) return null;
  return parseIncentiveMeta(body)?.href ?? INCENTIVE_HOME_HREF;
}
