"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Ban, Loader2, OctagonX, Pencil, Play, ReceiptIndianRupee, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, rupees } from "@/lib/billing/ui";
import { BILLING_DOC_STATUS_LABELS, type ContractPaymentType, type ContractStatus } from "@/db/enums";
import { sequenceLabel, type BillBucket } from "@/lib/billing/contracts";
import {
  cancelContractAction,
  deleteContractAction,
  raiseContractBillAction,
  setContractItemStoppedAction,
  setContractStoppedAction,
} from "@/app/(app)/billing/contracts/actions";
import type { ContractScheduleRow } from "@/lib/queries/billing-contracts";

/**
 * The billing schedule on a saved contract, with the actions that move money.
 *
 * Every button here calls the server and then refreshes: the page is rendered
 * from the database, so the numbers above the table (billed, remaining, the
 * Paid / Unpaid / Not Due split) can never drift from what the buttons did.
 */

const BUCKET_LABEL: Record<BillBucket, string> = { paid: "Paid", unpaid: "Unpaid", not_due: "Not due" };
const BUCKET_STYLE: Record<BillBucket, React.CSSProperties> = {
  paid: { background: "rgba(22,163,74,0.12)", color: "#15803D" },
  unpaid: { background: "rgba(234,88,12,0.12)", color: "#C2410C" },
  not_due: { background: "rgba(100,116,139,0.12)", color: "#475569" },
};

export function ContractSchedule({
  contractId,
  paymentType,
  status,
  schedule,
  upcoming,
  frequencyLabel,
  canDelete,
}: {
  contractId: string;
  paymentType: ContractPaymentType;
  status: ContractStatus;
  schedule: ContractScheduleRow[];
  upcoming: ContractScheduleRow[];
  frequencyLabel: string | null;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const open = status === "active";

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) {
        fireToast({ message: r.error ?? "That did not go through.", type: "error" });
        return false;
      }
      fireToast({ message: success, type: "success" });
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function raise(itemId: string | null, label: string) {
    setBusy(itemId ?? "retainer");
    try {
      const r = await raiseContractBillAction({ contractId, itemId });
      if (!r.ok) {
        fireToast({ message: r.error, type: "error" });
        return;
      }
      fireToast({
        message: `Bill raised for ${label} — a draft tax invoice is ready in Documents.`,
        type: "success",
        actionLabel: "Open invoice",
        action: () => router.push(`/billing/documents/${r.documentId}` as Route),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const rowLabel = (r: ContractScheduleRow, i: number, count: number) =>
    paymentType === "milestone"
      ? `Milestone ${r.seq}`
      : paymentType === "subscription"
        ? sequenceLabel(i, count)
        : paymentType === "retainer"
          ? `Period ${r.seq}`
          : "Full payment";

  const rows = [...schedule, ...upcoming];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {paymentType === "retainer" ? (
          <>
            <ActionBtn
              primary
              disabled={!open || busy !== null || upcoming.length === 0}
              busy={busy === "retainer"}
              onClick={() => void raise(null, `period ${upcoming[0]?.seq ?? ""}`)}
              title={upcoming.length === 0 ? "Nothing is left to bill" : undefined}
            >
              <ReceiptIndianRupee size={14} /> Raise Bill{upcoming[0] ? ` — ${frequencyLabel} period ${upcoming[0].seq}` : ""}
            </ActionBtn>
            {status === "stopped" ? (
              <ActionBtn
                disabled={busy !== null}
                busy={busy === "stop"}
                onClick={() => void run("stop", () => setContractStoppedAction({ id: contractId, stopped: false }), "Billing resumed.")}
              >
                <Play size={14} /> Resume Billing
              </ActionBtn>
            ) : status === "active" ? (
              <ActionBtn
                danger
                disabled={busy !== null}
                busy={busy === "stop"}
                onClick={() => {
                  if (!window.confirm("Stop billing on this contract? No further retainer bills will be raised until it is resumed.")) return;
                  void run("stop", () => setContractStoppedAction({ id: contractId, stopped: true }), "Billing stopped.");
                }}
              >
                <OctagonX size={14} /> Stop Billing
              </ActionBtn>
            ) : null}
          </>
        ) : null}
        <span className="flex-1" />
        {status !== "cancelled" ? (
          <Link
            href={`/billing/contracts/${contractId}/edit` as Route}
            className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[12.5px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <Pencil size={13} /> Edit contract
          </Link>
        ) : null}
        {status !== "cancelled" && !canDelete ? (
          <ActionBtn
            danger
            disabled={busy !== null}
            busy={busy === "cancel"}
            onClick={() => {
              const reason = window.prompt("Cancel this contract? Invoices already raised are not affected.\n\nReason:");
              if (!reason?.trim()) return;
              void run("cancel", () => cancelContractAction({ id: contractId, reason }), "Contract cancelled.");
            }}
          >
            <Ban size={14} /> Cancel contract
          </ActionBtn>
        ) : null}
        {canDelete ? (
          <ActionBtn
            danger
            disabled={busy !== null}
            busy={busy === "delete"}
            onClick={async () => {
              if (!window.confirm("Delete this contract, its schedule and its PDCs? This cannot be undone.")) return;
              const ok = await run("delete", () => deleteContractAction({ id: contractId }), "Contract deleted.");
              if (ok) router.push("/billing/contracts" as Route);
            }}
          >
            <Trash2 size={14} /> Delete contract
          </ActionBtn>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          {paymentType === "retainer" ? "No retainer bills yet." : "No billing entries on this contract."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                <th className="pb-2 pr-3">{paymentType === "subscription" ? "No." : paymentType === "milestone" ? "Milestone" : "Bill"}</th>
                <th className="pb-2 pr-3">Due Date</th>
                <th className="pb-2 pr-3">Description</th>
                <th className="pb-2 pr-3 text-right">Billing Amount</th>
                <th className="pb-2 pr-3">Invoice</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const label = rowLabel(r, i, schedule.length);
                const raisable = open && !r.projected && !r.live && r.status !== "stopped";
                const stoppable = !r.projected && !r.live && r.status !== "stopped" && status !== "cancelled";
                return (
                  <tr key={r.id} className={r.projected ? "text-ink-muted" : ""}>
                    <td className="border-t border-hairline py-2.5 pr-3 font-bold">{label}</td>
                    <td className="border-t border-hairline py-2.5 pr-3 tabular-nums">{r.dueDate ?? "—"}</td>
                    <td className="border-t border-hairline py-2.5 pr-3">
                      {r.description ?? (r.projected ? "Upcoming retainer bill" : "—")}
                    </td>
                    <td className="border-t border-hairline py-2.5 pr-3 text-right font-bold tabular-nums">{rupees(r.amount)}</td>
                    <td className="border-t border-hairline py-2.5 pr-3">
                      {r.document ? (
                        <Link href={`/billing/documents/${r.document.id}` as Route} className="font-semibold underline" style={{ color: BILLING_PURPLE_DEEP }}>
                          {r.document.docNo ?? "Draft"} · {BILLING_DOC_STATUS_LABELS[r.document.status]}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="border-t border-hairline py-2.5 pr-3">
                      {r.projected ? (
                        <Pill style={BUCKET_STYLE.not_due}>Upcoming</Pill>
                      ) : r.status === "stopped" ? (
                        <Pill style={{ background: "rgba(220,38,38,0.1)", color: "#B91C1C" }}>Stopped</Pill>
                      ) : r.bucket ? (
                        <Pill style={BUCKET_STYLE[r.bucket]}>
                          {r.live ? BUCKET_LABEL[r.bucket] : r.bucket === "unpaid" ? "Due — not raised" : "Not raised"}
                        </Pill>
                      ) : r.document?.status === "cancelled" ? (
                        <Pill style={{ background: "rgba(100,116,139,0.12)", color: "#475569" }}>Invoice cancelled</Pill>
                      ) : null}
                    </td>
                    <td className="border-t border-hairline py-2.5 text-right">
                      {paymentType !== "retainer" ? (
                        <div className="inline-flex gap-1.5">
                          {r.status === "stopped" && status !== "cancelled" ? (
                            <ActionBtn
                              small
                              disabled={busy !== null}
                              busy={busy === `resume-${r.id}`}
                              onClick={() =>
                                void run(
                                  `resume-${r.id}`,
                                  () => setContractItemStoppedAction({ contractId, itemId: r.id, stopped: false }),
                                  `${label} is back on the schedule.`,
                                )
                              }
                            >
                              <Play size={12} /> Resume
                            </ActionBtn>
                          ) : (
                            <>
                              <ActionBtn
                                small
                                primary
                                disabled={!raisable || busy !== null}
                                busy={busy === r.id}
                                title={r.live ? "A bill has already been raised" : !open ? "This contract is not billing" : undefined}
                                onClick={() => void raise(r.id, label)}
                              >
                                <ReceiptIndianRupee size={12} /> Raise Bill
                              </ActionBtn>
                              <ActionBtn
                                small
                                danger
                                disabled={!stoppable || busy !== null}
                                busy={busy === `stop-${r.id}`}
                                title={r.live ? "Cancel its invoice in Documents to stop this row" : undefined}
                                onClick={() => {
                                  if (!window.confirm(`Stop billing for ${label}? It will not be billed unless resumed.`)) return;
                                  void run(
                                    `stop-${r.id}`,
                                    () => setContractItemStoppedAction({ contractId, itemId: r.id, stopped: true }),
                                    `Billing stopped for ${label}.`,
                                  );
                                }}
                              >
                                <OctagonX size={12} /> Stop Billing
                              </ActionBtn>
                            </>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {paymentType !== "retainer" && status !== "cancelled" ? (
        <p className="mt-3 text-[12px] text-ink-muted">
          Need another entry? <Link href={`/billing/contracts/${contractId}/edit` as Route} className="font-bold underline">+ Add more</Link> on the contract.
        </p>
      ) : null}
    </div>
  );
}

function Pill({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={style}>
      {children}
    </span>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  busy,
  primary,
  danger,
  small,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  title?: string;
}) {
  const style: React.CSSProperties = primary
    ? { background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})`, color: "#fff" }
    : danger
      ? { boxShadow: "inset 0 0 0 1px rgba(220,38,38,0.45)", color: "#B91C1C" }
      : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip font-bold disabled:opacity-40 ${
        small ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[12.5px]"
      }`}
      style={style}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : null}
      {children}
    </button>
  );
}
