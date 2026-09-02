"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { decideIncentiveRequest } from "@/app/(app)/incentive/actions";
import {
  INCENTIVE_TYPE_LABELS,
  INCENTIVE_STATUS_LABELS,
  type IncentiveStatus,
} from "@/db/enums";
import { incentiveDetailPairs } from "@/lib/incentive-fields";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import { formatDate } from "@/lib/format";

const STATUS_STYLE: Record<IncentiveStatus, { bg: string; fg: string }> = {
  pending:  { bg: "rgba(245,158,11,0.12)", fg: "#B45309" },
  approved: { bg: "rgba(22,163,74,0.12)",  fg: "#15803D" },
  rejected: { bg: "rgba(225,6,0,0.10)",    fg: "#A80400" },
};

export function IncentiveList({
  rows,
  isAdmin,
}: {
  rows: IncentiveRequestRow[];
  isAdmin: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[15px] text-ink-subtle">
        No incentive requests yet — file the first one with “New request”.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <RequestCard key={r.id} row={r} isAdmin={isAdmin} />
      ))}
    </ul>
  );
}

function RequestCard({ row, isAdmin }: { row: IncentiveRequestRow; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const pairs = incentiveDetailPairs(row.type, row.details);
  // Fall back for any status not in the map (unknown/legacy) so a bad row can't
  // crash the admin's full requests list.
  const style = STATUS_STYLE[row.status] ?? { bg: "rgba(100,116,139,0.12)", fg: "#334155" };

  function decide(verdict: "approved" | "rejected") {
    startTransition(async () => {
      const res = await decideIncentiveRequest({ id: row.id, verdict });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: verdict === "approved" ? "Request approved." : "Request rejected.",
        type: verdict === "approved" ? "success" : "info",
      });
    });
  }

  return (
    <li
      className="wg-rise rounded-[18px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 24px -20px rgba(15,23,42,0.35)",
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[16px] font-semibold text-ink-strong">
              {INCENTIVE_TYPE_LABELS[row.type] ?? row.type}
            </span>
            <span
              className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold"
              style={{ background: style.bg, color: style.fg }}
            >
              {INCENTIVE_STATUS_LABELS[row.status] ?? row.status}
            </span>
          </div>
          <p className="text-[13.5px] text-ink-subtle mt-1">
            {isAdmin ? `${row.employeeName} · ` : ""}
            {formatDate(row.createdAt)}
            {row.decidedByName &&
              ` · ${row.status === "approved" ? "approved" : "decided"} by ${row.decidedByName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && row.status === "pending" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("approved")}
                className="brand-btn wg-btn wg-sheen cursor-pointer rounded-full px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #16A34A, #15803D)",
                  boxShadow:
                    "0 8px 20px -10px rgba(21,128,61,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("rejected")}
                className="wg-btn cursor-pointer rounded-full px-4 py-2 text-[13px] font-bold disabled:opacity-50"
                style={{
                  background: "rgba(225,6,0,0.08)",
                  color: "#A80400",
                  boxShadow: "inset 0 0 0 1px rgba(225,6,0,0.25)",
                }}
              >
                Reject
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-soft"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            Details
          </button>
        </div>
      </div>

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
              <dd className="text-[14.5px] text-ink-strong mt-0.5 break-words">{value}</dd>
            </div>
          ))}
          {row.decisionNote && (
            <div className="col-span-full">
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                Decision note
              </dt>
              <dd className="text-[14.5px] text-ink-strong mt-0.5">{row.decisionNote}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}
