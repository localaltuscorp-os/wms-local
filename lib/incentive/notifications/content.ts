import { INCENTIVE_STATUS_LABELS, INCENTIVE_TYPE_LABELS, type IncentiveStatus, type IncentiveType } from "@/db/enums";
import type { ChipTone } from "@/emails/notifications/_notification-layout";
import { defaultIncentiveAmount } from "@/lib/incentive-amount";
import { INCENTIVE_DATE_KEY, incentiveDetailPairs } from "@/lib/incentive-fields";
import type { DecisionAction } from "@/lib/incentive/workflow";
import { incentiveDurationLabel, incentiveTypeLabel } from "@/lib/incentive/master";
import { formatDMonY, formatInr, localDateString } from "@/lib/format";
import { eligibleGroupsLabel, type CatalogChange, type CatalogSnapshot } from "./eligibility";
import {
  DECISION_NOTIFICATION_KIND,
  INCENTIVE_HOME_HREF,
  INCENTIVE_TABLE_HREF,
  incentiveReference,
  incentiveRequestHref,
  safeIncentiveHref,
  type IncentiveNotificationKind,
  type IncentiveNotificationMeta,
} from "./kinds";

/**
 * INCENTIVE NOTIFICATION CONTENT — what each event says. Pure and client-safe.
 *
 * Two halves:
 *   · `build*Notification` — turn a recorded event into the notification's
 *     title (also the email subject) and its stored meta. Run once, when the
 *     event happens.
 *   · `INCENTIVE_EMAIL_TEMPLATES` — turn stored meta into the email's content,
 *     one entry per email template. Run every time the email is rendered
 *     (first send and any retry), by `IncentiveNoticeEmail`.
 *
 * There is one email layout (emails/notifications/IncentiveNotice.tsx) and the
 * twelve templates below are data for it, so the markup is written once.
 */

const TZ = "Asia/Kolkata";
const TITLE_MAX = 120;

export interface BuiltIncentiveNotification {
  kind: IncentiveNotificationKind;
  title: string;
  meta: IncentiveNotificationMeta;
}

function clip(s: string | null | undefined, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

function title(s: string): string {
  return clip(s, TITLE_MAX);
}

/** 15-Sep-2026, 4:05 pm — in IST, whatever the server's zone. The date is the
 *  app's own DD-Mon-YYYY (`formatDMonY`); locale month names vary by runtime
 *  ("Sep" vs "Sept"), so they are not used. */
export function formatIstDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = formatDMonY(localDateString(TZ, d));
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .toLowerCase();
  return `${date}, ${time}`;
}

function monthLabel(ymd: string | null | undefined): string {
  const m = ymd?.match(/^(\d{4})-(\d{2})/);
  if (!m) return "";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

// ── Requests ─────────────────────────────────────────────────────────────────

export function requestTypeLabel(type: IncentiveType, details: Record<string, string> | null | undefined): string {
  const base = INCENTIVE_TYPE_LABELS[type] ?? type;
  const happiness = type === "client_happiness" ? details?.happiness_type : undefined;
  return happiness ? `${base} · ${happiness}` : base;
}

function requestFacts(requestId: string, type: IncentiveType, details: Record<string, string> | null | undefined) {
  const d = details ?? {};
  const amount = defaultIncentiveAmount(type, d);
  return {
    requestId,
    reference: incentiveReference(requestId),
    typeLabel: requestTypeLabel(type, d),
    incentiveDate: d[INCENTIVE_DATE_KEY] || null,
    amount: amount > 0 ? amount : null,
    details: incentiveDetailPairs(type, d)
      .filter(([label]) => !/^(notes|incentive date)$/i.test(label.trim()))
      .slice(0, 4)
      .map(([label, value]) => [label, clip(value, 140)] as [string, string]),
  };
}

const NOTE_REQUIRED = new Set<DecisionAction>(["not_approve", "revise", "reverse"]);

const DECISION_TITLE: Record<DecisionAction, string> = {
  approve: "Incentive approved",
  publish: "Incentive published",
  not_approve: "Incentive not approved",
  revise: "Revision required",
  due: "Incentive marked Due",
  not_due: "Incentive marked Not Due",
  reverse: "Incentive reversed",
};

/**
 * The notification for one recorded decision, or null when the decision needs
 * a note and has none — a Not Approved, Revise or Reversed notice is never sent
 * without the reason (the workflow refuses such decisions anyway; this is the
 * second lock).
 */
export function buildDecisionNotification(input: {
  action: DecisionAction;
  requestId: string;
  type: IncentiveType;
  details: Record<string, string> | null | undefined;
  submissionNo: number;
  newStatus: IncentiveStatus;
  note: string | null | undefined;
  decidedAt: Date;
  reviewerName: string | null;
}): BuiltIncentiveNotification | null {
  const note = input.note?.trim() ? input.note.trim() : null;
  if (NOTE_REQUIRED.has(input.action) && !note) return null;

  const f = requestFacts(input.requestId, input.type, input.details);
  const amount = f.amount ? ` · ${formatInr(f.amount)}` : "";
  const when = formatIstDateTime(input.decidedAt);
  const summaries: Record<DecisionAction, string> = {
    approve: `${f.typeLabel}${amount} was approved on ${when}.`,
    publish: `${f.typeLabel}${amount} was approved and published on ${when}.`,
    not_approve: `Reason: ${clip(note, 160)} — open the request to Justify & Resubmit.`,
    revise: `Revision note: ${clip(note, 160)} — open the request to revise and resubmit.`,
    due: `${f.typeLabel}${amount} is now due for payment.`,
    not_due: `${f.typeLabel} was marked Not Due on ${when}.`,
    reverse: `Reversal reason: ${clip(note, 160)}`,
  };

  return {
    kind: DECISION_NOTIFICATION_KIND[input.action],
    title: title(`${DECISION_TITLE[input.action]}: ${f.typeLabel} (${f.reference})`),
    meta: {
      v: 1,
      summary: summaries[input.action],
      href: incentiveRequestHref(input.requestId),
      requestId: f.requestId,
      reference: f.reference,
      typeLabel: f.typeLabel,
      incentiveDate: f.incentiveDate,
      amount: f.amount,
      statusLabel: INCENTIVE_STATUS_LABELS[input.newStatus] ?? input.newStatus,
      eventAt: input.decidedAt.toISOString(),
      actorName: input.reviewerName,
      note,
      submissionNo: input.submissionNo,
      details: f.details,
    },
  };
}

/** The reviewer's notice that an employee justified and resubmitted a request. */
export function buildResubmissionNotification(input: {
  requestId: string;
  type: IncentiveType;
  details: Record<string, string> | null | undefined;
  submissionNo: number;
  justification: string | null | undefined;
  submittedAt: Date;
  employeeName: string | null;
}): BuiltIncentiveNotification {
  const f = requestFacts(input.requestId, input.type, input.details);
  const who = input.employeeName ?? "An employee";
  const preview = clip(input.justification, 280) || null;
  return {
    kind: "incentive_request_resubmitted",
    title: title(`Incentive resubmitted by ${who}: ${f.typeLabel} (${f.reference})`),
    meta: {
      v: 1,
      summary: `An incentive request has been resubmitted. ${f.typeLabel} · Submission ${input.submissionNo}${
        preview ? ` · “${clip(preview, 120)}”` : ""
      }`,
      href: incentiveRequestHref(input.requestId),
      requestId: f.requestId,
      reference: f.reference,
      typeLabel: f.typeLabel,
      incentiveDate: f.incentiveDate,
      amount: f.amount,
      statusLabel: INCENTIVE_STATUS_LABELS.pending,
      eventAt: input.submittedAt.toISOString(),
      actorName: input.employeeName,
      employeeName: input.employeeName,
      submissionNo: input.submissionNo,
      justification: preview,
      details: f.details,
    },
  };
}

// ── Incentive Master ─────────────────────────────────────────────────────────

export type CatalogNotificationKind =
  | "incentive_created"
  | "incentive_updated"
  | "incentive_eligibility_removed"
  | "incentive_deleted";

export function buildCatalogNotification(input: {
  kind: CatalogNotificationKind;
  snapshot: CatalogSnapshot;
  /** YYYY-MM-DD, from the change record. */
  effectiveDate: string;
  changes: CatalogChange[];
  newlyEligible?: boolean;
}): BuiltIncentiveNotification {
  const s = input.snapshot;
  const date = formatDMonY(input.effectiveDate);
  const groups = eligibleGroupsLabel(s);
  const changed = input.changes.map((c) => c.label).join(", ");

  const copy: Record<CatalogNotificationKind, { title: string; summary: string }> = {
    incentive_created: input.newlyEligible
      ? {
          title: `You're now eligible: ${s.name}`,
          summary: `You are now eligible for ${s.name} (${formatInr(s.amount)}) with effect from ${date}.`,
        }
      : {
          title: `New incentive: ${s.name}`,
          summary: `${formatInr(s.amount)} · for ${groups} · effective ${date}.`,
        },
    incentive_updated: {
      title: `Incentive updated: ${s.name}`,
      summary: `An incentive has been updated. Please check the Incentive Table for the latest details.${
        changed ? ` Changed: ${changed}.` : ""
      }`,
    },
    incentive_eligibility_removed: {
      title: `No longer eligible: ${s.name}`,
      summary: `You are no longer eligible for this incentive with effect from ${date}.`,
    },
    incentive_deleted: {
      title: `Incentive removed: ${s.name}`,
      summary: "This incentive is no longer available. Please check the Incentive Table.",
    },
  };

  return {
    kind: input.kind,
    title: title(copy[input.kind].title),
    meta: {
      v: 1,
      summary: copy[input.kind].summary,
      href: INCENTIVE_TABLE_HREF,
      incentiveName: s.name,
      amount: s.amount,
      typeLabel: incentiveTypeLabel(s.incentiveType) ?? undefined,
      productName: s.productName ?? undefined,
      durationLabel: s.duration ? incentiveDurationLabel(s.duration) : undefined,
      eligibleGroups: groups,
      description: s.description,
      effectiveDate: input.effectiveDate,
      // From the snapshot as at the change (migration 0232). Was hardcoded null
      // while the Master had no Valid Until field; the email template has always
      // rendered the row when there is one.
      validUntil: s.validUntil ?? null,
      changes: input.changes.slice(0, 10).map(({ label, from, to }) => ({ label, from, to })),
      newlyEligible: input.newlyEligible === true,
    },
  };
}

// ── Payment ──────────────────────────────────────────────────────────────────

export function buildPaidNotification(input: {
  label: string | null;
  amount: number;
  paidDate: string | null;
  periodMonth: string | null;
}): BuiltIncentiveNotification {
  const what = input.label?.trim() || "Incentive";
  const on = input.paidDate ? ` on ${formatDMonY(input.paidDate)}` : "";
  return {
    kind: "incentive_paid",
    title: title(`Incentive paid: ${formatInr(input.amount)} · ${what}`),
    meta: {
      v: 1,
      summary: `Your incentive (${what}) of ${formatInr(input.amount)} has been paid${on}.`,
      href: INCENTIVE_HOME_HREF,
      incentiveName: what,
      amount: input.amount,
      paidDate: input.paidDate,
      periodMonth: input.periodMonth,
    },
  };
}

// ── Email templates ──────────────────────────────────────────────────────────

export interface IncentiveEmailContent {
  preview: string;
  chip: { label: string; tone: ChipTone };
  headline: string;
  lead: string;
  details: { label: string; value: string }[];
  quote?: { label: string; text: string } | null;
  changes?: { label: string; from: string; to: string }[];
  /** Path on the WMS site; the layout prefixes the site URL. */
  cta: { label: string; path: string };
  footnote?: string | null;
}

type Row = { label: string; value: string };

function push(rows: Row[], label: string, value: string | null | undefined) {
  if (value != null && String(value).trim() !== "") rows.push({ label, value: String(value) });
}

function requestRows(m: IncentiveNotificationMeta, opts: { amountLabel: string; dateLabel: string }): Row[] {
  const rows: Row[] = [];
  push(rows, "Reference", m.reference);
  push(rows, "Incentive", m.typeLabel);
  push(rows, "Incentive date", m.incentiveDate ? formatDMonY(m.incentiveDate) : null);
  push(rows, opts.amountLabel, m.amount ? formatInr(m.amount) : null);
  push(rows, "Status", m.statusLabel);
  push(rows, opts.dateLabel, formatIstDateTime(m.eventAt));
  if (m.submissionNo && m.submissionNo > 1) push(rows, "Submission", String(m.submissionNo));
  for (const [label, value] of m.details ?? []) push(rows, label, value);
  return rows;
}

function catalogRows(m: IncentiveNotificationMeta, dateLabel: string): Row[] {
  const rows: Row[] = [];
  push(rows, "Incentive", m.incentiveName);
  push(rows, "Type", m.typeLabel);
  push(rows, "Product", m.productName);
  push(rows, "Amount", typeof m.amount === "number" ? formatInr(m.amount) : null);
  push(rows, "Duration", m.durationLabel);
  push(rows, "Eligible", m.eligibleGroups);
  push(rows, dateLabel, m.effectiveDate ? formatDMonY(m.effectiveDate) : null);
  push(rows, "Valid until", m.validUntil ? formatDMonY(m.validUntil) : null);
  push(rows, "About", m.description);
  return rows;
}

const reviewer = (m: IncentiveNotificationMeta) => m.actorName ?? "The reviewer";
const requestCta = (m: IncentiveNotificationMeta, label: string) => ({ label, path: safeIncentiveHref(m.href) });
const tableCta = { label: "Open the Incentive Table", path: INCENTIVE_TABLE_HREF };

export type IncentiveEmailKind = Exclude<IncentiveNotificationKind, "incentive_request_not_due">;

/**
 * One template per emailed event. "Not Due" is deliberately not emailed — it
 * says nothing is payable yet, which the in-app notice covers — so it has no
 * entry and `incentiveEmailContent` returns null for it.
 */
export const INCENTIVE_EMAIL_TEMPLATES: Record<
  IncentiveEmailKind,
  (m: IncentiveNotificationMeta) => IncentiveEmailContent | null
> = {
  // 1. New Incentive
  incentive_created: (m) => ({
    preview: m.summary,
    chip: { label: m.newlyEligible ? "Now eligible" : "New incentive", tone: "blue" },
    headline: m.newlyEligible
      ? `You are now eligible for ${m.incentiveName}.`
      : `A new incentive is available to you: ${m.incentiveName}.`,
    lead: m.newlyEligible
      ? "The Incentive Table has been updated to include you. Here is what it pays."
      : "It has been added to the Incentive Table. Here is what it pays and who it is for.",
    details: catalogRows(m, "Effective from"),
    cta: tableCta,
  }),

  // 2. Eligibility Removed
  incentive_eligibility_removed: (m) =>
    m.effectiveDate
      ? {
          preview: m.summary,
          chip: { label: "Eligibility removed", tone: "amber" },
          headline: `You are no longer eligible for this incentive with effect from ${formatDMonY(m.effectiveDate)}.`,
          lead: `The Incentive Table entry for ${m.incentiveName} no longer includes you. Requests you have already filed stay on record.`,
          details: catalogRows(m, "Effective from"),
          changes: m.changes,
          cta: tableCta,
        }
      : null,

  // 3. Incentive Updated
  incentive_updated: (m) => ({
    preview: m.summary,
    chip: { label: "Updated", tone: "purple" },
    headline: `An incentive has been updated: ${m.incentiveName}.`,
    lead: "Please check the Incentive Table for the latest details.",
    details: catalogRows(m, "Updated on"),
    changes: m.changes,
    cta: tableCta,
  }),

  // 4. Incentive Deleted
  incentive_deleted: (m) => ({
    preview: m.summary,
    chip: { label: "No longer available", tone: "rose" },
    headline: `${m.incentiveName} is no longer available.`,
    lead: "It has been removed from the Incentive Table. Please check the Incentive Table for the incentives currently on offer. Requests and payments already on record are kept.",
    details: catalogRows(m, "Removed on"),
    cta: tableCta,
  }),

  // 5. Incentive Not Approved
  incentive_request_not_approved: (m) =>
    m.note
      ? {
          preview: m.summary,
          chip: { label: "Not Approved", tone: "red" },
          headline: "Your incentive request was not approved.",
          lead: `${reviewer(m)} reviewed your ${m.typeLabel} request. The reason is below. If you can address it, justify and resubmit the request — your original submission is kept.`,
          details: requestRows(m, { amountLabel: "Amount", dateLabel: "Decided on" }),
          quote: { label: "Reason for rejection", text: m.note },
          cta: requestCta(m, "Justify & Resubmit"),
        }
      : null,

  // 6. Incentive Approved
  incentive_request_approved: (m) => ({
    preview: m.summary,
    chip: { label: "Approved", tone: "green" },
    headline: "Your incentive request was approved.",
    lead: `${reviewer(m)} approved your ${m.typeLabel} request.`,
    details: requestRows(m, { amountLabel: "Approved amount", dateLabel: "Approval date" }),
    quote: m.note ? { label: "Note", text: m.note } : null,
    cta: requestCta(m, "View the request"),
  }),

  // 7. Incentive Due
  incentive_request_due: (m) => ({
    preview: m.summary,
    chip: { label: "Due", tone: "amber" },
    headline: "Your incentive has been marked Due.",
    lead: `Your ${m.typeLabel} incentive is now due for payment.`,
    details: requestRows(m, { amountLabel: "Amount", dateLabel: "Marked Due on" }),
    quote: m.note ? { label: "Note", text: m.note } : null,
    cta: requestCta(m, "View the request"),
  }),

  // 8. Incentive Paid
  incentive_paid: (m) => {
    const rows: Row[] = [];
    push(rows, "Incentive", m.incentiveName);
    push(rows, "Amount paid", typeof m.amount === "number" ? formatInr(m.amount) : null);
    push(rows, "Paid on", m.paidDate ? formatDMonY(m.paidDate) : null);
    push(rows, "For", monthLabel(m.periodMonth));
    return {
      preview: m.summary,
      chip: { label: "Paid", tone: "green" },
      headline: "Your incentive has been paid.",
      lead: "Accounts has recorded the payment below.",
      details: rows,
      cta: { label: "View my incentives", path: INCENTIVE_HOME_HREF },
    };
  },

  // 9. Incentive Resubmitted
  incentive_request_resubmitted: (m) => {
    const rows: Row[] = [];
    push(rows, "Employee", m.employeeName);
    rows.push(...requestRows(m, { amountLabel: "Amount", dateLabel: "Resubmitted on" }));
    return {
      preview: m.summary,
      chip: { label: "Resubmitted", tone: "blue" },
      headline: "An incentive request has been resubmitted.",
      lead: `${m.employeeName ?? "An employee"} justified and resubmitted a ${m.typeLabel} request that was sent back. It is waiting for your review.`,
      details: rows,
      quote: m.justification ? { label: "Justification", text: m.justification } : null,
      cta: requestCta(m, "Review the request"),
    };
  },

  // 10. Incentive Reversed
  incentive_request_reversed: (m) =>
    m.note
      ? {
          preview: m.summary,
          chip: { label: "Reversed", tone: "rose" },
          headline: "An incentive of yours has been reversed.",
          lead: `${reviewer(m)} reversed your ${m.typeLabel} incentive. The reason is below.`,
          details: requestRows(m, { amountLabel: "Amount", dateLabel: "Reversed on" }),
          quote: { label: "Reversal reason", text: m.note },
          cta: requestCta(m, "View the request"),
        }
      : null,

  // 11. Revision Required
  incentive_request_revision: (m) =>
    m.note
      ? {
          preview: m.summary,
          chip: { label: "Revision Required", tone: "amber" },
          headline: "Your incentive request needs a revision.",
          lead: `${reviewer(m)} asked for changes to your ${m.typeLabel} request before it can be published. Revise it and resubmit — your original submission is kept.`,
          details: requestRows(m, { amountLabel: "Amount", dateLabel: "Requested on" }),
          quote: { label: "Revision note", text: m.note },
          cta: requestCta(m, "Revise & Resubmit"),
        }
      : null,

  // 12. Published
  incentive_request_published: (m) => ({
    preview: m.summary,
    chip: { label: "Published", tone: "green" },
    headline: "Your incentive request was approved and published.",
    lead: `${reviewer(m)} approved your ${m.typeLabel} submission for publishing.`,
    details: requestRows(m, { amountLabel: "Approved amount", dateLabel: "Published on" }),
    quote: m.note ? { label: "Note", text: m.note } : null,
    cta: requestCta(m, "View the request"),
  }),
};

export function incentiveEmailContent(
  kind: IncentiveNotificationKind,
  meta: IncentiveNotificationMeta | null,
): IncentiveEmailContent | null {
  if (!meta || kind === "incentive_request_not_due") return null;
  return INCENTIVE_EMAIL_TEMPLATES[kind](meta);
}
