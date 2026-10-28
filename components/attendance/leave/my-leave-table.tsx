"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { LEAVE_KIND_LABELS, type LeaveKind } from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import { cancelLeave } from "@/app/(app)/attendance/leave/actions";
import { fireToast } from "@/lib/toast";
import { LeaveStatusChip, leaveRangeLabel } from "./leave-ui";
import { EditLeaveDialog } from "./edit-leave-dialog";

export interface MyLeaveTableProps {
  rows: LeaveRow[];
  categories?: readonly { id: string; name: string }[];
  allowedKinds?: readonly LeaveKind[];
  paidRemaining?: number;
  paidEligible?: boolean;
}

export function MyLeaveTable({
  rows,
  categories = [],
  allowedKinds = ["paid", "unpaid"],
  paidRemaining = 0,
  paidEligible = true,
}: MyLeaveTableProps) {
  const [editingRow, setEditingRow] = useState<LeaveRow | null>(null);

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
    <>
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
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row
                key={r.id}
                row={r}
                onEdit={() => setEditingRow(r)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <EditLeaveDialog
          row={editingRow}
          open={!!editingRow}
          onOpenChange={(open) => {
            if (!open) setEditingRow(null);
          }}
          categories={categories}
          allowedKinds={allowedKinds}
          paidRemaining={paidRemaining}
          paidEligible={paidEligible}
        />
      )}
    </>
  );
}

function Row({
  row,
  onEdit,
}: {
  row: LeaveRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onCancel() {
    const actionLabel = row.status === "pending" ? "Withdraw" : "Cancel";
    if (!window.confirm(`${actionLabel} this leave request? This cannot be undone.`)) return;

    startTransition(async () => {
      const res = await cancelLeave({ id: row.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Leave request ${actionLabel.toLowerCase()}ed.` });
      router.refresh();
    });
  }

  const canModify = row.status === "pending" || row.status === "approved";

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
        <div className="flex items-center gap-2 whitespace-nowrap">
          <LeaveStatusChip status={row.status} />
        </div>
      </Td>
      <Td align="right">
        {canModify && (
          <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <Pencil size={12} strokeWidth={2.4} /> Edit
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-ink-subtle transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} strokeWidth={2.4} />
              )}
              {row.status === "pending" ? "Withdraw" : "Cancel"}
            </button>
          </div>
        )}
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
