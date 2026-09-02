"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAVE_KIND_LABELS } from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import { cancelLeave } from "@/app/(app)/attendance/leave/actions";
import { fireToast } from "@/lib/toast";
import { LeaveStatusChip, leaveRangeLabel } from "./leave-ui";

/**
 * My Leave Requests (spec §2) — Date · Leave Type · Days · Reason · Status.
 *
 * One plain table, no cards and no per-row action cluster. The only action an
 * employee has is withdrawing a request they filed and nobody has decided yet,
 * so it hangs off the status cell as a quiet text button instead of earning a
 * column of its own that would be empty on every decided row.
 *
 * On narrow screens the table scrolls inside its own container rather than the
 * page — Reason is the column that wants the room, and truncating it to fit a
 * phone would hide the only free-text a reviewer wrote.
 */
export function MyLeaveTable({ rows }: { rows: LeaveRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-[14px] px-5 py-8 text-center text-[13.5px] text-ink-subtle"
        style={{ border: "1px dashed var(--color-hairline)" }}
      >
        No leave requests yet.
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-[14px] bg-surface-card"
      style={{ border: "1px solid var(--color-hairline)" }}
    >
      <table className="min-w-full text-[13.5px]">
        <thead>
          <tr className="text-left text-[12px] font-semibold text-ink-subtle">
            <Th>Date</Th>
            <Th>Leave Type</Th>
            <Th align="right">Days</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row }: { row: LeaveRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function withdraw() {
    startTransition(async () => {
      const res = await cancelLeave({ id: row.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Request withdrawn." });
      router.refresh();
    });
  }

  return (
    <tr style={{ borderTop: "1px solid var(--color-hairline)" }}>
      <Td className="whitespace-nowrap tabular-nums font-medium text-ink-strong">
        {leaveRangeLabel(row)}
      </Td>
      <Td className="whitespace-nowrap text-ink-soft">
        {LEAVE_KIND_LABELS[row.kind]}
        {row.categoryName && (
          <span className="mt-0.5 block text-[12px] text-ink-subtle">{row.categoryName}</span>
        )}
      </Td>
      <Td align="right" className="tabular-nums text-ink-soft">
        {row.days}
      </Td>
      <Td className="max-w-[320px] text-ink-soft">
        {row.reason || <span className="text-ink-subtle">—</span>}
        {row.decisionNote && (
          <span className="mt-0.5 block text-[12px] text-ink-subtle">
            {row.decidedByName ? `${row.decidedByName}: ` : ""}
            {row.decisionNote}
          </span>
        )}
      </Td>
      <Td>
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <LeaveStatusChip status={row.status} />
          {row.status === "pending" && (
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="text-[12.5px] font-semibold text-ink-subtle underline-offset-2 transition-colors hover:text-ink-strong hover:underline disabled:opacity-50"
            >
              Withdraw
            </button>
          )}
        </div>
      </Td>
    </tr>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 align-top ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
