"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Inbox, ListChecks } from "lucide-react";
import { INCENTIVE_STATUS_LABELS, INCENTIVE_TYPE_LABELS } from "@/db/enums";
import { INCENTIVE_DATE_KEY, incentiveDetailPairs } from "@/lib/incentive-fields";
import { defaultIncentiveAmount } from "@/lib/incentive-amount";
import { formatPct } from "@/lib/incentive/split";
import {
  availableDecisions,
  canResubmit,
  isContentReviewRequest,
  needsReview,
} from "@/lib/incentive/workflow";
import { INCENTIVE_REVIEWER_NAME } from "@/lib/auth/incentive-permissions";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatDMonY, formatInr } from "@/lib/format";
import { IncentiveStatusPill } from "./incentive-status-pill";
import { IncentiveHistory, formatIncentiveDateTime } from "./incentive-history";
import { IncentiveDecisionPanel } from "./incentive-decision-panel";
import { IncentiveFormDialog } from "./incentive-form-dialog";

/**
 * INCENTIVE REQUESTS — three views of one list.
 *
 *   · The REVIEWER (Manan Vasa): "Needs your review" first — every request
 *     Pending Approval, Due or Not Due — then everything else. Opening a request
 *     shows the whole submission, its links, its split and its history, and
 *     only then the decision panel.
 *   · ADMINS: everyone's requests, read-only. Admins used to have Approve and
 *     Reject here; deciding is now Manan's alone, and the server refuses anyone
 *     else regardless of what renders.
 *   · EMPLOYEES: their own requests. A Not Approved or Revision Requested one
 *     shows the reason, when it was decided, and Justify & Resubmit.
 */
export function IncentiveList({
  rows,
  isAdmin,
  canReview,
  me,
  employees,
  products,
  focusRequestId = null,
}: {
  rows: IncentiveRequestRow[];
  isAdmin: boolean;
  /** The signed-in user is the incentive reviewer. Presentation only — the
   *  decision action checks this again on the server. */
  canReview: boolean;
  me: { id: string; name: string };
  employees: EmployeeOption[];
  products: string[];
  /** Opened from a notification: this request starts expanded and in view. */
  focusRequestId?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[15px] text-ink-subtle">
        No incentive requests yet - file the first one with “New request”.
      </p>
    );
  }

  const card = (r: IncentiveRequestRow) => (
    <RequestCard
      key={r.id}
      row={r}
      showEmployee={isAdmin || canReview}
      canReview={canReview}
      isOwner={r.employeeId === me.id}
      me={me}
      employees={employees}
      products={products}
      focused={r.id === focusRequestId}
    />
  );

  if (canReview) {
    const queue = rows.filter((r) => needsReview(r.status));
    const rest = rows.filter((r) => !needsReview(r.status));
    return (
      <div className="space-y-8">
        <section aria-labelledby="inc-review-queue" data-review-queue>
          <SectionHeading id="inc-review-queue" icon={Inbox} title="Needs your review" count={queue.length}>
            Open a request to see everything submitted and its history, then record your decision.
          </SectionHeading>
          {queue.length === 0 ? (
            <p className="text-[14.5px] text-ink-subtle">Nothing is waiting for your review.</p>
          ) : (
            <ul className="space-y-3">{queue.map(card)}</ul>
          )}
        </section>
        {rest.length > 0 && (
          <section aria-labelledby="inc-all-requests">
            <SectionHeading id="inc-all-requests" icon={ListChecks} title="All other requests" count={rest.length}>
              Decided, sent back, or waiting on the employee.
            </SectionHeading>
            <ul className="space-y-3">{rest.map(card)}</ul>
          </section>
        )}
      </div>
    );
  }

  return <ul className="space-y-3">{rows.map(card)}</ul>;
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  count,
  children,
}: {
  id: string;
  icon: typeof Inbox;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <h3 id={id} className="flex items-center gap-2 text-[17px] font-bold text-ink-strong">
        <Icon size={17} strokeWidth={2.3} aria-hidden />
        {title}
        <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[12px] font-bold tabular-nums text-ink-muted">
          {count}
        </span>
      </h3>
      <p className="mt-0.5 text-[13.5px] text-ink-subtle">{children}</p>
    </div>
  );
}

function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v.trim());
}

function RequestCard({
  row,
  showEmployee,
  canReview,
  isOwner,
  me,
  employees,
  products,
  focused,
}: {
  row: IncentiveRequestRow;
  showEmployee: boolean;
  canReview: boolean;
  isOwner: boolean;
  me: { id: string; name: string };
  employees: EmployeeOption[];
  products: string[];
  focused: boolean;
}) {
  const [expanded, setExpanded] = useState(focused);
  const cardRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);
  const pairs = incentiveDetailPairs(row.type, row.details);
  const content = isContentReviewRequest(row.type, row.details);
  const decidable = canReview && availableDecisions(row.type, row.details, row.status).length > 0;
  const amount = defaultIncentiveAmount(row.type, row.details ?? {});
  const incentiveDate = row.details?.[INCENTIVE_DATE_KEY];
  const happiness = row.type === "client_happiness" ? row.details?.happiness_type : undefined;
  const resubmittable = isOwner && canResubmit(row.status);

  return (
    <li
      ref={cardRef}
      className="wg-rise rounded-[18px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow: focused
          ? "inset 0 0 0 2px color-mix(in srgb, var(--color-altus-red) 55%, transparent), 0 8px 24px -20px rgba(15,23,42,0.35)"
          : "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 24px -20px rgba(15,23,42,0.35)",
      }}
      data-request={row.id}
      data-focused={focused || undefined}
      data-status={row.status}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[16px] font-semibold text-ink-strong">
              {INCENTIVE_TYPE_LABELS[row.type] ?? row.type}
              {happiness && <span className="font-medium text-ink-muted"> · {happiness}</span>}
            </span>
            <IncentiveStatusPill status={row.status} />
            {row.submissionNo > 1 && (
              <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11.5px] font-bold text-ink-muted">
                Submission {row.submissionNo}
              </span>
            )}
            {content && canReview && (
              <span className="rounded-pill px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "rgba(146,64,14,0.10)", color: "#92400E" }}>
                Content review
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-ink-subtle mt-1">
            {showEmployee ? <b className="font-semibold text-ink-soft">{row.employeeName}</b> : null}
            {showEmployee ? " · " : ""}
            {incentiveDate ? `Incentive date ${formatDMonY(incentiveDate)}` : `Filed ${formatDate(row.createdAt)}`}
            {amount > 0 && ` · ${formatInr(amount)}`}
            {row.resubmittedAt && ` · resubmitted ${formatDate(row.resubmittedAt)}`}
          </p>
          {row.decidedAt && row.decidedByName && (
            <p className="text-[12.5px] text-ink-subtle mt-0.5">
              {INCENTIVE_STATUS_LABELS[row.status] ?? row.status} by {row.decidedByName} ·{" "}
              {formatIncentiveDateTime(row.decidedAt)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft"
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? "Close" : decidable ? "Open request" : "Details"}
        </button>
      </div>

      {/* The employee's rejection / revision experience — visible without
          opening the card, because it is the thing they need to act on. */}
      {resubmittable && (
        <div
          className="mt-3 rounded-xl px-4 py-3"
          style={{
            background: row.status === "rejected" ? "rgba(225,6,0,0.06)" : "rgba(245,158,11,0.08)",
            boxShadow: `inset 0 0 0 1px ${row.status === "rejected" ? "rgba(225,6,0,0.22)" : "rgba(245,158,11,0.30)"}`,
          }}
          data-resubmit-callout
        >
          <p className="text-[13.5px] font-bold text-ink-strong">
            {row.status === "rejected"
              ? `${INCENTIVE_REVIEWER_NAME} did not approve this incentive.`
              : `${INCENTIVE_REVIEWER_NAME} asked for this to be revised.`}
          </p>
          {row.decisionNote && (
            <div className="mt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                {row.status === "rejected" ? "Reason" : "Revision note"}
              </span>
              <p className="text-[14px] text-ink-strong whitespace-pre-wrap break-words">{row.decisionNote}</p>
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] text-ink-subtle">
              Decided {formatIncentiveDateTime(row.decidedAt)}. Your submission is kept — resubmitting adds a new one.
            </span>
            <IncentiveFormDialog
              products={products}
              employees={employees}
              me={me}
              resubmit={{
                id: row.id,
                type: row.type,
                details: row.details ?? {},
                split: row.split,
                status: row.status,
                reason: row.decisionNote,
                decidedAt: row.decidedAt,
                decidedByName: row.decidedByName,
                submissionNo: row.submissionNo,
              }}
            />
          </div>
        </div>
      )}

      {/* A reason on a request that is NOT waiting on the employee (Reversed,
          or a note left with any other decision) is still theirs to read. */}
      {!resubmittable && row.decisionNote && (isOwner || showEmployee) && (
        <div className="mt-3 rounded-xl bg-surface-soft px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {row.status === "reversed" ? "Reversal reason" : "Decision note"}
          </span>
          <p className="text-[14px] text-ink-strong whitespace-pre-wrap break-words">{row.decisionNote}</p>
        </div>
      )}

      {expanded && (
        <dl
          className="mt-4 grid grid-cols-2 max-md:grid-cols-1 gap-x-6 gap-y-2.5 border-t pt-4"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          {pairs.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                {label}
              </dt>
              <dd className="text-[14.5px] text-ink-strong mt-0.5 break-words whitespace-pre-wrap">
                {isLink(value) ? (
                  <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="font-semibold text-altus-red underline-offset-2 hover:underline">
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
          {amount > 0 && (
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Amount</dt>
              <dd className="text-[14.5px] text-ink-strong mt-0.5 tabular-nums">{formatInr(amount)}</dd>
            </div>
          )}
          {row.split && row.split.length > 0 && (
            <div className="col-span-full">
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                Split
              </dt>
              <dd className="text-[14.5px] text-ink-strong mt-0.5 break-words">
                {row.split.map((s) => `${s.name} ${formatPct(s.pct)}%`).join(" · ")}
              </dd>
            </div>
          )}

          <div className="col-span-full border-t pt-3" style={{ borderColor: "var(--color-hairline)" }}>
            <IncentiveHistory
              key={`${row.id}:${row.submissionNo}:${row.status}`}
              requestId={row.id}
              currentSubmissionNo={row.submissionNo}
              currentStatus={row.status}
            />
          </div>

          {decidable && <IncentiveDecisionPanel key={`${row.id}:${row.status}`} row={row} />}
        </dl>
      )}
    </li>
  );
}
