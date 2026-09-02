"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import {
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
  type LeaveStatus,
} from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import { decideLeave, cancelLeave } from "@/app/(app)/attendance/leave/actions";

const STATUS_STYLE: Record<LeaveStatus, { bg: string; fg: string }> = {
  pending:   { bg: "rgba(245,158,11,0.12)", fg: "#B45309" },
  approved:  { bg: "rgba(22,163,74,0.12)",  fg: "#15803D" },
  rejected:  { bg: "rgba(225,6,0,0.10)",    fg: "#A80400" },
  cancelled: { bg: "rgba(15,23,42,0.06)",   fg: "#64748B" },
};

/** "12 Aug 2026" from YYYY-MM-DD (no timezone drift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[(m ?? 1) - 1]} ${y}`;
}

export function LeaveList({
  rows,
  mode,
}: {
  rows: LeaveRow[];
  /** "mine" → show cancel on own pending; "pending" → admin approve/reject. */
  mode: "mine" | "pending";
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[15px] text-ink-subtle">
        {mode === "pending"
          ? "No leave requests are awaiting approval."
          : "No leave requests yet — submit one with the form above."}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <LeaveCard key={r.id} row={r} mode={mode} />
      ))}
    </ul>
  );
}

function LeaveCard({ row, mode }: { row: LeaveRow; mode: "mine" | "pending" }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const style = STATUS_STYLE[row.status];

  function decide(verdict: "approved" | "rejected") {
    startTransition(async () => {
      const res = await decideLeave({ id: row.id, verdict, note: note.trim() || undefined });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: verdict === "approved" ? "Leave approved." : "Leave rejected.",
        type: verdict === "approved" ? "success" : "info",
      });
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelLeave({ id: row.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Request cancelled." });
      router.refresh();
    });
  }

  const canCancelMine = mode === "mine" && row.status === "pending";
  const showAdminActions = mode === "pending" && row.status === "pending";

  return (
    <li
      className="rounded-section bg-surface-card p-5 max-md:p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[16px] font-semibold text-ink-strong">
              {LEAVE_KIND_LABELS[row.kind]}
            </span>
            <span
              className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold"
              style={{ background: style.bg, color: style.fg }}
            >
              {LEAVE_STATUS_LABELS[row.status]}
            </span>
          </div>
          <p className="text-[14px] text-ink-soft mt-1.5 tabular-nums">
            {prettyDate(row.startDate)} → {prettyDate(row.endDate)}
            <span className="text-ink-subtle">
              {" "}· {row.days} day{row.days === 1 ? "" : "s"}
            </span>
          </p>
          {mode === "pending" && (
            <p className="text-[13.5px] text-ink-subtle mt-1">{row.employeeName}</p>
          )}
          {row.reason && (
            <p className="text-[13.5px] text-ink-soft mt-1.5" style={{ lineHeight: 1.5 }}>
              {row.reason}
            </p>
          )}
          {row.decisionNote && (
            <p className="text-[13px] text-ink-subtle mt-1.5">
              Note: {row.decisionNote}
            </p>
          )}
        </div>

        {(canCancelMine || showAdminActions) && (
          <div className="flex flex-col items-end gap-2">
            {showAdminActions && (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Note (optional)"
                  className="w-44 rounded-md border border-[#CBD5E1] px-2.5 py-1.5 text-[13px]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("approved")}
                    className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("rejected")}
                    className="rounded-md px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
                    style={{
                      background: "rgba(225,6,0,0.08)",
                      color: "#A80400",
                      border: "1px solid rgba(225,6,0,0.25)",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
            {canCancelMine && (
              <button
                type="button"
                disabled={pending}
                onClick={cancel}
                className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:text-ink-strong disabled:opacity-50"
                style={{ border: "1px solid var(--color-hairline)" }}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
