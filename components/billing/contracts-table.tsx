"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { CSSProperties } from "react";
import { Ban, Eye, Paperclip, Pencil, Play, Square, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar, barBtn, barBtnDanger, useRowSelection } from "@/components/billing/selection-bar";
import { BILLING_PURPLE_DEEP, rupees } from "@/lib/billing/ui";
import { CONTRACT_PAYMENT_TYPE_LABELS, CONTRACT_STATUS_LABELS, type ContractStatus } from "@/db/enums";
import type { ContractSummary } from "@/lib/queries/billing-contracts";
import {
  cancelContractAction,
  deleteContractAction,
  setContractStoppedAction,
} from "@/app/(app)/billing/contracts/actions";

/**
 * ALL CONTRACTS — the table, with the same tick-and-act bar the Documents list
 * uses.
 *
 * It is the SAME `SelectionBar` / `useRowSelection` pair, not a second one:
 * two bulk bars that looked alike but behaved differently would be worse than
 * none, and the count chip, the divider and the pinned Clear are the shape
 * people have already learned on Documents.
 *
 * WHAT THE BAR OFFERS IS WHAT A CONTRACT CAN ACTUALLY DO. View and Edit want
 * exactly one row, so they disable on a multi-selection rather than guessing
 * which one was meant. Stop / Resume are the two halves of one switch and each
 * lights up only for the rows in the opposite state. Delete is offered only for
 * contracts that never raised a bill — the server refuses the rest, and a
 * button that is always there but usually fails is a button nobody trusts.
 */

const STATUS_STYLE: Record<ContractStatus, CSSProperties> = {
  active: { background: "rgba(225,6,0,0.12)", color: BILLING_PURPLE_DEEP },
  completed: { background: "rgba(22,163,74,0.12)", color: "#15803D" },
  stopped: { background: "rgba(234,88,12,0.12)", color: "#C2410C" },
  cancelled: { background: "rgba(100,116,139,0.14)", color: "#475569" },
};

export function ContractsTable({
  rows,
  entityNames,
}: {
  rows: ContractSummary[];
  /** entityId → display name, resolved on the server. */
  entityNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const sel = useRowSelection(rows.map((r) => r.id));
  const selectedRows = rows.filter((r) => sel.selected.has(r.id));

  /**
   * Run the same action over every selected row and report once.
   *
   * Sequential on purpose: these are writes against one contract each, and
   * firing twenty at a database that is already the slow part of this app buys
   * nothing. Failures are collected rather than thrown so one bad row does not
   * hide the nineteen that worked.
   */
  function runMany(
    label: string,
    picked: ContractSummary[],
    fn: (row: ContractSummary) => Promise<{ ok: boolean; error?: string }>,
  ) {
    if (picked.length === 0) return;
    start(async () => {
      const failed: string[] = [];
      for (const row of picked) {
        try {
          const res = await fn(row);
          if (!res.ok) failed.push(`${row.customerName}: ${res.error ?? "refused"}`);
        } catch {
          failed.push(`${row.customerName}: that didn't go through`);
        }
      }
      if (failed.length === 0) {
        fireToast({
          message: `${label} — ${picked.length} ${picked.length === 1 ? "contract" : "contracts"}.`,
          type: "success",
        });
        sel.clear();
      } else {
        fireToast({ message: failed[0]!, type: "error" });
      }
      router.refresh();
    });
  }

  const one = selectedRows.length === 1 ? selectedRows[0] : null;
  const canStop = selectedRows.filter((r) => r.status === "active");
  const canResume = selectedRows.filter((r) => r.status === "stopped");
  // The server refuses a contract that has billed; filtering here means the
  // button is absent rather than present-and-failing.
  const canDelete = selectedRows.filter((r) => r.billedAmount === 0);

  return (
    <>
      <SelectionBar count={selectedRows.length} pending={pending} onClear={sel.clear}>
        <Link
          href={(one ? `/billing/contracts/${one.id}` : "/billing/contracts") as Route}
          aria-disabled={!one}
          tabIndex={one ? undefined : -1}
          className={`${barBtn} ${one ? "" : "pointer-events-none opacity-50"}`}
        >
          <Eye size={14} strokeWidth={2.4} />
          View
        </Link>
        <Link
          href={(one ? `/billing/contracts/${one.id}/edit` : "/billing/contracts") as Route}
          aria-disabled={!one}
          tabIndex={one ? undefined : -1}
          className={`${barBtn} ${one ? "" : "pointer-events-none opacity-50"}`}
        >
          <Pencil size={14} strokeWidth={2.4} />
          Edit
        </Link>

        <span className="mx-1 h-5 w-px shrink-0 bg-hairline" aria-hidden />

        <button
          type="button"
          className={barBtn}
          disabled={pending || canStop.length === 0}
          title={canStop.length === 0 ? "Only an active contract can be stopped" : undefined}
          onClick={() =>
            runMany("Billing stopped", canStop, (r) =>
              setContractStoppedAction({ id: r.id, stopped: true }),
            )
          }
        >
          <Square size={13} strokeWidth={2.6} />
          Stop billing
        </button>
        <button
          type="button"
          className={barBtn}
          disabled={pending || canResume.length === 0}
          title={canResume.length === 0 ? "Only a stopped contract can be resumed" : undefined}
          onClick={() =>
            runMany("Billing resumed", canResume, (r) =>
              setContractStoppedAction({ id: r.id, stopped: false }),
            )
          }
        >
          <Play size={13} strokeWidth={2.6} />
          Resume
        </button>

        <span className="mx-1 h-5 w-px shrink-0 bg-hairline" aria-hidden />

        <button
          type="button"
          className={barBtnDanger}
          disabled={pending || selectedRows.length === 0}
          onClick={() => {
            /* Cancelling wants a reason — the server enforces at least three
               characters. Asked ONCE for the whole selection rather than per
               row: cancelling five contracts in one go is one decision. */
            const reason = window.prompt(
              `Why are these ${selectedRows.length === 1 ? "contract" : `${selectedRows.length} contracts`} being cancelled?`,
            );
            if (reason === null) return;
            if (reason.trim().length < 3) {
              fireToast({ message: "Say why this contract is being cancelled.", type: "error" });
              return;
            }
            runMany("Cancelled", selectedRows, (r) =>
              cancelContractAction({ id: r.id, reason: reason.trim() }),
            );
          }}
        >
          <Ban size={13} strokeWidth={2.6} />
          Cancel
        </button>
        <button
          type="button"
          className={barBtnDanger}
          disabled={pending || canDelete.length === 0}
          title={
            canDelete.length === 0
              ? "Only a contract that never raised a bill can be deleted"
              : undefined
          }
          onClick={() => {
            if (
              !window.confirm(
                `Delete ${canDelete.length} ${canDelete.length === 1 ? "contract" : "contracts"}? Only contracts that never raised a bill are included.`,
              )
            )
              return;
            runMany("Deleted", canDelete, (r) => deleteContractAction({ id: r.id }));
          }}
        >
          <Trash2 size={13} strokeWidth={2.6} />
          Delete
        </button>
      </SelectionBar>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1140px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
              <th className="w-10 pb-2 pr-1">
                <Checkbox
                  checked={sel.allOn}
                  indeterminate={sel.someOn}
                  onChange={sel.toggleAll}
                  ariaLabel="Select all contracts"
                />
              </th>
              <th className="pb-2 pr-3">Client</th>
              <th className="pb-2 pr-3">Payment Type</th>
              <th className="pb-2 pr-3">Period</th>
              <th className="pb-2 pr-3 text-right">Contract Value</th>
              <th className="pb-2 pr-3 text-right">Billed</th>
              <th className="pb-2 pr-3 text-right">Paid</th>
              <th className="pb-2 pr-3 text-right">Unpaid</th>
              <th className="pb-2 pr-3 text-right">Not Due</th>
              <th className="pb-2 pr-3 text-right">PDCs</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const on = sel.selected.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={on ? "bg-[color:color-mix(in_srgb,var(--color-altus-red)_5%,transparent)]" : undefined}
                >
                  <td className="border-t border-hairline py-2.5 pr-1">
                    <Checkbox
                      checked={on}
                      onChange={(next) => sel.toggle(c.id, next)}
                      ariaLabel={`Select ${c.customerName}`}
                    />
                  </td>
                  <td className="border-t border-hairline py-2.5 pr-3">
                    <Link
                      href={`/billing/contracts/${c.id}` as Route}
                      className="font-bold text-ink-strong underline-offset-2 hover:underline"
                    >
                      {c.customerName}
                    </Link>
                    <div className="flex items-center gap-1 text-[11.5px] text-ink-muted">
                      {entityNames[c.entityId] ?? c.entityId}
                      {c.hasAttachment ? <Paperclip size={11} aria-label="Contract attached" /> : null}
                    </div>
                  </td>
                  <td className="border-t border-hairline py-2.5 pr-3">
                    {CONTRACT_PAYMENT_TYPE_LABELS[c.paymentType]}
                    {c.billingFrequency ? (
                      <span className="text-ink-muted">
                        {" · "}
                        {c.billingFrequency === "quarterly" ? "Quarterly" : "Monthly"}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-t border-hairline py-2.5 pr-3 tabular-nums text-ink-muted">
                    {formatDate(c.startDate)} → {formatDate(c.endDate)}
                  </td>
                  <td className="border-t border-hairline py-2.5 pr-3 text-right font-bold tabular-nums">
                    {rupees(c.totalValue)}
                  </td>
                  <td className="border-t border-hairline py-2.5 pr-3 text-right tabular-nums">
                    {rupees(c.billedAmount)}
                  </td>
                  <BucketCell b={c.buckets.paid} />
                  <BucketCell b={c.buckets.unpaid} />
                  <BucketCell b={c.buckets.notDue} />
                  <td className="border-t border-hairline py-2.5 pr-3 text-right tabular-nums">
                    {c.pdc.count > 0 ? (
                      <>
                        {c.pdc.count} · {rupees(c.pdc.amount)}
                      </>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="border-t border-hairline py-2.5">
                    <span
                      className="inline-flex rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                      style={STATUS_STYLE[c.status]}
                    >
                      {CONTRACT_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BucketCell({ b }: { b: { count: number; amount: number } }) {
  return (
    <td className="border-t border-hairline py-2.5 pr-3 text-right tabular-nums">
      {b.count > 0 ? (
        <>
          <span className="font-semibold">{rupees(b.amount)}</span>
          <div className="text-[11px] text-ink-muted">
            {b.count} bill{b.count === 1 ? "" : "s"}
          </div>
        </>
      ) : (
        <span className="text-ink-muted">—</span>
      )}
    </td>
  );
}
