"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { getIncentiveRequestHistory } from "@/app/(app)/incentive/actions";
import { INCENTIVE_STATUS_LABELS, type IncentiveStatus } from "@/db/enums";
import { incentiveDetailPairs } from "@/lib/incentive-fields";
import { formatPct } from "@/lib/incentive/split";
import { DECISION_LABELS } from "@/lib/incentive/workflow";
import { INCENTIVE_REVIEWER_NAME } from "@/lib/auth/incentive-permissions";
import type {
  IncentiveDecisionEntry,
  IncentiveRequestHistory,
} from "@/lib/incentive/workflow-server";
import { IncentiveStatusPill } from "./incentive-status-pill";

/** "15-Sep-2026, 4:05 pm" in IST — a decision's date AND time, as the brief asks. */
export function formatIncentiveDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const date = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    .replace(/ /g, "-");
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  return `${date}, ${time}`;
}

function noteLabelFor(action: IncentiveDecisionEntry["action"]): string {
  if (action === "revise") return "Revision note";
  if (action === "not_approve" || action === "reverse") return "Reason";
  return "Note";
}

function decisionText(d: IncentiveDecisionEntry): string {
  if (d.action === "legacy") return `Marked ${INCENTIVE_STATUS_LABELS[d.newStatus] ?? d.newStatus}`;
  if (d.action === "publish") return "Published — Approved";
  if (d.action === "revise") return "Sent back for revision";
  return `Marked ${DECISION_LABELS[d.action]}`;
}

/**
 * SUBMISSION HISTORY for one request — every version the employee sent and
 * every decision made on it, oldest first, grouped by submission.
 *
 * Loaded when the request is opened rather than with the page: the list can be
 * long, and nobody needs the full trail of a request they have not opened. The
 * parent keys this on the request's status and submission number, so a decision
 * or a resubmission remounts it and the trail is re-read.
 */
export function IncentiveHistory({
  requestId,
  currentSubmissionNo,
  currentStatus,
}: {
  requestId: string;
  currentSubmissionNo: number;
  currentStatus: IncentiveStatus;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; history: IncentiveRequestHistory }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    getIncentiveRequestHistory(requestId)
      .then((res) => {
        if (!alive) return;
        setState(res.ok ? { kind: "ready", history: res.history } : { kind: "error", error: res.error });
      })
      .catch(() => {
        if (alive) setState({ kind: "error", error: "Could not load the history." });
      });
    return () => {
      alive = false;
    };
  }, [requestId]);

  return (
    <section aria-label="Submission history" className="col-span-full">
      <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        <History size={13} strokeWidth={2.4} aria-hidden />
        History
      </h4>

      {state.kind === "loading" && <p className="text-[13.5px] text-ink-subtle">Loading history…</p>}
      {state.kind === "error" && <p className="text-[13.5px] font-semibold text-altus-red">{state.error}</p>}

      {state.kind === "ready" && (
        <ol className="space-y-3" data-incentive-history>
          {state.history.submissions.map((s) => {
            const decisions = state.history.decisions.filter((d) => d.submissionNo === s.submissionNo);
            const isCurrent = s.submissionNo === currentSubmissionNo;
            const earlierPairs = isCurrent ? [] : incentiveDetailPairs(s.type, s.details);
            return (
              <li
                key={s.submissionNo}
                className="rounded-xl border px-3.5 py-3"
                style={{ borderColor: "var(--color-hairline)" }}
                data-submission={s.submissionNo}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[14px] font-bold text-ink-strong">Submission {s.submissionNo}</span>
                  {isCurrent && (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">current</span>
                  )}
                  <span className="text-[12.5px] text-ink-subtle">
                    {formatIncentiveDateTime(s.submittedAt)}
                    {s.submittedByName ? ` · ${s.submittedByName}` : ""}
                  </span>
                </div>

                {s.justification && (
                  <Labeled label="Justification">{s.justification}</Labeled>
                )}

                {earlierPairs.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-soft">
                      What was submitted
                    </summary>
                    <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 max-md:grid-cols-1">
                      {earlierPairs.map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</dt>
                          <dd className="text-[13.5px] text-ink-strong break-words">{value}</dd>
                        </div>
                      ))}
                      {s.split && s.split.length > 0 && (
                        <div className="col-span-full">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Split</dt>
                          <dd className="text-[13.5px] text-ink-strong">
                            {s.split.map((p) => `${p.name} ${formatPct(p.pct)}%`).join(" · ")}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </details>
                )}

                <ul className="mt-2 space-y-2">
                  {decisions.map((d, i) => (
                    <li key={i} className="flex flex-col gap-1" data-decision={d.action}>
                      <div className="flex flex-wrap items-center gap-2">
                        <IncentiveStatusPill status={d.newStatus} />
                        <span className="text-[13.5px] font-semibold text-ink-strong">{decisionText(d)}</span>
                        <span className="text-[12.5px] text-ink-subtle">
                          {d.reviewerName ? `by ${d.reviewerName} · ` : ""}
                          {formatIncentiveDateTime(d.createdAt)}
                        </span>
                      </div>
                      {d.note && <Labeled label={noteLabelFor(d.action)}>{d.note}</Labeled>}
                    </li>
                  ))}
                  {decisions.length === 0 && isCurrent && currentStatus === "pending" && (
                    <li className="flex flex-wrap items-center gap-2">
                      <IncentiveStatusPill status="pending" />
                      <span className="text-[13px] text-ink-subtle">Waiting for {INCENTIVE_REVIEWER_NAME}&rsquo;s review</span>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</span>
      <p className="text-[13.5px] text-ink-strong whitespace-pre-wrap break-words">{children}</p>
    </div>
  );
}
