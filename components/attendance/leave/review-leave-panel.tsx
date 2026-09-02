"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LEAVE_KIND_LABELS, OFFICE_PHONE_AVAILABILITY_LABELS } from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import { decideLeave } from "@/app/(app)/attendance/leave/actions";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  LEAVE_INPUT_CLASS,
  LEAVE_INPUT_RING,
  LeaveField,
  LeaveStatusChip,
  dayCountLabel,
  prettyDate,
  workerTypeLabel,
} from "./leave-ui";

/** The paid-balance facts the panel shows for a full-time requester. */
export interface ReviewBalance {
  allowance: number;
  remaining: number;
  used: number;
  cycleLabel: string;
  paidEligible: boolean;
}

/**
 * The REVIEW side panel (spec §4). One request, everything needed to rule on
 * it, and two buttons.
 *
 * It is a panel rather than an expanded row because the decision needs the
 * reason text and the requester's remaining balance at full width — details the
 * table deliberately abbreviates. Rendered as a right-side sheet (the app's
 * existing drawer shape, see components/dashboard/aging-task-drawer.tsx) so the
 * queue stays visible behind it and closing returns you to your place in it.
 *
 * NOTE for callers: mount this with `key={row.id}`. The note field is local
 * state, and a stale line typed while reviewing one person must never ride
 * along onto the next person's decision. Re-keying discards it on identity
 * change, which is what a remount is for — clearing it from an effect instead
 * would cost an extra render pass on every open.
 */
export function ReviewLeavePanel({
  row,
  balance,
  onClose,
}: {
  row: LeaveRow | null;
  balance: ReviewBalance | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const open = row != null;

  // Esc closes; the body must not scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!row) return null;

  const decided = row.status !== "pending";
  const singleDay = row.startDate === row.endDate;
  // Rendered only when at least one question was ANSWERED. A block of three
  // dashes says "we asked and got nothing", which is not what a null means on a
  // request filed before the questions existed.
  const availability: { label: string; value: string }[] = [];
  if (row.availPersonalPhone != null) {
    availability.push({
      label: "Personal phone",
      value: row.availPersonalPhone ? "Yes" : "No",
    });
  }
  if (row.availOfficePhone) {
    availability.push({
      label: "Office phone",
      value: OFFICE_PHONE_AVAILABILITY_LABELS[row.availOfficePhone],
    });
  }
  if (row.availComputer != null) {
    availability.push({
      label: "Computer & internet",
      value: row.availComputer ? "Yes" : "No",
    });
  }

  function decide(verdict: "approved" | "rejected") {
    if (!row) return;
    startTransition(async () => {
      const res = await decideLeave({
        id: row.id,
        verdict,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: verdict === "approved" ? "Leave approved." : "Leave rejected.",
        type: verdict === "approved" ? "success" : "info",
      });
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Review leave request — ${row.employeeName}`}
    >
      <button
        type="button"
        aria-label="Close review panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-sm"
      />

      <aside
        className="relative flex h-full w-[440px] max-w-full flex-col bg-surface-card shadow-2xl max-sm:w-full"
        style={{ borderLeft: "1px solid var(--color-hairline)" }}
      >
        {/* ── Who ── */}
        <div
          className="flex shrink-0 items-start gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-hairline)" }}
        >
          <EmployeeAvatar name={row.employeeName} size="sm" />
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 17,
                letterSpacing: "-0.02em",
              }}
            >
              {row.employeeName}
            </h2>
            <p className="text-[12.5px] text-ink-subtle">
              {workerTypeLabel(row.workerType)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:text-ink-strong"
            style={{ border: "1px solid var(--color-hairline)" }}
          >
            <X size={14} strokeWidth={2.6} />
          </button>
        </div>

        {/* ── The request ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
            Leave Request
          </h3>
          <dl className="space-y-0">
            <DetailRow label="Leave Type" value={LEAVE_KIND_LABELS[row.kind]} />
            {row.categoryName && (
              <DetailRow label="Category" value={row.categoryName} />
            )}
            {/* The half is named on the DATE it belongs to, not as a separate
                "half day: yes" row — "2nd half" and "1st half" mean opposite
                things and a shared flag cannot say which. */}
            <DetailRow
              label="From Date"
              value={`${prettyDate(row.startDate)}${row.startHalfDay ? (singleDay ? " · half day" : " · from 2nd half") : ""}`}
            />
            <DetailRow
              label="To Date"
              value={`${prettyDate(row.endDate)}${row.endHalfDay ? " · until 1st half" : ""}`}
            />
            <DetailRow label="Total Days" value={dayCountLabel(row.days)} />
            <DetailRow
              label="Status"
              value={<LeaveStatusChip status={row.status} />}
            />
          </dl>

          <div className="mt-4">
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              Reason
            </h3>
            <p
              className="rounded-lg px-3 py-2.5 text-[13.5px] text-ink-soft"
              style={{
                background: "var(--color-surface-soft)",
                border: "1px solid var(--color-hairline)",
                lineHeight: 1.55,
              }}
            >
              {row.reason || "No reason given."}
            </p>
          </div>

          {availability.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                Reachable While Away
              </h3>
              <dl
                className="rounded-lg px-3 py-1.5"
                style={{
                  background: "var(--color-surface-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                {availability.map((a) => (
                  <DetailRow key={a.label} label={a.label} value={a.value} />
                ))}
              </dl>
            </div>
          )}

          {/* Balance is shown only where it MEANS something: a paid request from
              someone who accrues paid leave. On an unpaid request it is not the
              number the decision turns on. */}
          {row.kind === "paid" && balance?.paidEligible && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                Current Leave Balance
              </h3>
              <div
                className="rounded-lg px-3 py-2.5 text-[13.5px] text-ink-soft"
                style={{
                  background: "var(--color-surface-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <span className="font-bold tabular-nums text-ink-strong">
                  {balance.remaining}
                </span>{" "}
                of {balance.allowance} paid days left · {balance.cycleLabel}
                {row.status === "pending" && balance.remaining < row.days && (
                  <span className="mt-1 block text-[12.5px] font-semibold" style={{ color: "#A80400" }}>
                    This request is {row.days} days — approving would exceed the
                    balance and will be refused.
                  </span>
                )}
              </div>
            </div>
          )}

          {row.kind === "unpaid" && (
            <p
              className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px]"
              style={{
                background: "var(--color-surface-soft)",
                border: "1px solid var(--color-hairline)",
                color: "var(--color-ink-soft)",
                lineHeight: 1.5,
              }}
            >
              <Info size={14} strokeWidth={2.3} className="mt-0.5 shrink-0 text-ink-subtle" />
              Approval will mark these dates as Absent and the applicable salary
              will be deducted.
            </p>
          )}

          {decided ? (
            <p className="mt-4 text-[12.5px] text-ink-subtle">
              {row.decidedByName
                ? `Decided by ${row.decidedByName}.`
                : "Already decided."}
              {row.decisionNote ? ` ${row.decisionNote}` : ""}
            </p>
          ) : (
            <div className="mt-4">
              <LeaveField label="Note" hint="optional" htmlFor="review-note">
                <input
                  id="review-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Shared with the employee"
                  className={LEAVE_INPUT_CLASS}
                  style={LEAVE_INPUT_RING}
                />
              </LeaveField>
            </div>
          )}
        </div>

        {/* ── Verdict ── */}
        {!decided && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 px-5 py-3.5"
            style={{ borderTop: "1px solid var(--color-hairline)" }}
          >
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("rejected")}
              className="wg-btn rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-50"
              style={{
                color: "#A80400",
                border: "1px solid rgba(225,6,0,0.28)",
              }}
            >
              Reject
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("approved")}
              className="wg-btn rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #16A34A, #15803D)",
                boxShadow: "0 3px 12px -6px rgba(22,163,74,0.6)",
              }}
            >
              {pending ? "Saving…" : "Approve"}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2"
      style={{ borderBottom: "1px solid var(--color-hairline)" }}
    >
      <dt className="text-[13px] text-ink-subtle">{label}</dt>
      <dd className="text-[13.5px] font-semibold text-ink-strong">{value}</dd>
    </div>
  );
}
