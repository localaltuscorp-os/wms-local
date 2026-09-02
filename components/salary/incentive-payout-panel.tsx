"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, HandCoins, Wallet, BadgeCheck, CheckCircle2, Ban } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import type { IncentivePayoutBoard, IncentivePayoutRow } from "@/lib/queries/incentive-payout";
import { payIncentivesWithRun } from "@/app/(app)/salary/incentive-payout/actions";
import {
  ReorderableTh,
  useColumnOrder,
  type ColumnOrderControl,
} from "@/components/ui/reorderable-columns";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";
const AMBER = "#d97706";

/**
 * WS-6 — "Pay incentive from the same place as salary". Renders the per-person
 * board: Booked · Accrued · Amount Payable · Amount Paid · Remainder, with a
 * "Pay with salary" control that calls the flag-gated payout action. When the
 * kill-switch is off the action is a server-side no-op, so the button is
 * disabled and the panel shows a clear disabled banner.
 */
/**
 * The payout board columns. `header` carries the icon + text run the design
 * uses; `label` is the plain accessible name for the drag handle, which cannot
 * read a name out of JSX. The trailing Action rail is anchored to the right
 * edge where the pay button belongs.
 */
const PAYOUT_COLUMNS: {
  id: string;
  label: string;
  header: React.ReactNode;
  align?: "right";
}[] = [
  { id: "person", label: "Person", header: "Person" },
  {
    id: "booked",
    label: "Booked",
    align: "right",
    header: (
      <span className="inline-flex items-center gap-1">
        <HandCoins size={13} style={{ color: AMBER }} /> Booked
      </span>
    ),
  },
  {
    id: "accrued",
    label: "Accrued",
    align: "right",
    header: (
      <span className="inline-flex items-center gap-1">
        <Wallet size={13} style={{ color: GREEN }} /> Accrued
      </span>
    ),
  },
  { id: "payable", label: "Payable", align: "right", header: "Payable" },
  {
    id: "paid",
    label: "Paid",
    align: "right",
    header: (
      <span className="inline-flex items-center gap-1">
        <BadgeCheck size={13} style={{ color: GREEN_DEEP }} /> Paid
      </span>
    ),
  },
  { id: "remainder", label: "Remainder", align: "right", header: "Remainder" },
  { id: "action", label: "Action", align: "right", header: "Action" },
];

const PAYOUT_COLUMN_IDS = PAYOUT_COLUMNS.map((c) => c.id);

export function IncentivePayoutPanel({
  board,
  enabled,
}: {
  board: IncentivePayoutBoard;
  enabled: boolean;
}) {
  // Drag-to-reorder, remembered for THIS user across sessions and devices.
  const cols = useColumnOrder({
    tableKey: "accounts.salary.incentive-payout",
    columns: PAYOUT_COLUMN_IDS,
    pinned: ["action"],
  });
  const orderedColumns = cols.ordered(PAYOUT_COLUMNS, (c) => c.id);

  const router = useRouter();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  function pay(row: IncentivePayoutRow) {
    if (!enabled || !row.salaryRunId || row.remainder <= 0) return;
    setPendingKey(row.key);
    (async () => {
      try {
        const res = await payIncentivesWithRun({ salaryRunId: row.salaryRunId, basis: "accrued" });
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({
          message:
            res.paidCount > 0
              ? `Paid ${formatInr(res.totalPaid)} incentive with salary (${res.paidCount} item${res.paidCount === 1 ? "" : "s"}).`
              : "Nothing to pay — already settled.",
        });
        router.refresh();
      } finally {
        setPendingKey(null);
      }
    })();
  }

  return (
    <section className="wg-rise admin-panel overflow-hidden p-0" style={{ animationDelay: "120ms" }}>
      {!enabled && (
        <div
          className="flex items-start gap-2.5 px-5 py-3.5"
          style={{
            background: `color-mix(in srgb, ${AMBER} 12%, transparent)`,
            boxShadow: "inset 0 -1px 0 var(--color-hairline)",
          }}
        >
          <Ban size={16} strokeWidth={2.4} style={{ color: AMBER }} className="mt-0.5 shrink-0" />
          <p className="text-[13px] font-semibold text-ink-soft">
            Payouts are turned OFF (<code>INCENTIVE_PAYOUT</code>). This board is read-only — the
            &ldquo;Pay with salary&rdquo; action is a no-op until Sir enables the flag.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-left text-ink-subtle" style={{ background: "var(--color-surface-sunken)" }}>
              {orderedColumns.map((c) => (
                <Th key={c.id} id={c.id} ctl={cols} label={c.label} align={c.align}>
                  {c.header}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-ink-subtle">
                  No incentive activity for this month.
                </td>
              </tr>
            ) : (
              board.rows.map((row) => {
                const busy = pendingKey === row.key;
                const canPay = enabled && !!row.salaryRunId && row.remainder > 0;
                return (
                  <tr key={row.key} className="border-t border-hairline align-middle">
                    {orderedColumns.map((c) => {
                      if (c.id === "person") return (
                        <td key={c.id} className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <EmployeeAvatar name={row.name} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate font-bold text-ink-strong">{row.name}</div>
                              <div className="text-[11.5px] font-medium text-ink-subtle">
                                {row.salaryRunId ? (
                                  <>
                                    {row.designationName ?? "—"}
                                    {row.payingEntityName ? ` · ${row.payingEntityName}` : ""}
                                  </>
                                ) : (
                                  <span style={{ color: AMBER }}>no salary run this month</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      );
                      if (c.id === "booked") return <Td key={c.id} align="right" muted>{row.booked ? formatInr(row.booked) : "—"}</Td>;
                      if (c.id === "accrued") return <Td key={c.id} align="right">{row.accrued ? formatInr(row.accrued) : "—"}</Td>;
                      if (c.id === "payable") return <Td key={c.id} align="right" strong>{formatInr(row.payable)}</Td>;
                      if (c.id === "paid") return <Td key={c.id} align="right">{formatInr(row.paid)}</Td>;
                      if (c.id === "remainder") return (
                        <td key={c.id} className="px-4 py-3 text-right tabular-nums">
                          {row.nils ? (
                            <span
                              className="inline-flex items-center gap-1 font-bold"
                              style={{ color: GREEN_DEEP }}
                            >
                              <CheckCircle2 size={14} strokeWidth={2.5} /> nil
                            </span>
                          ) : (
                            <span className="font-bold" style={{ color: AMBER }}>
                              {formatInr(row.remainder)}
                            </span>
                          )}
                        </td>
                      );
                      return (
                        <td key={c.id} className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={!canPay || busy}
                            onClick={() => pay(row)}
                            className="wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                              boxShadow: `0 8px 20px -12px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                            }}
                            title={
                              !enabled
                                ? "Payouts are turned off"
                                : !row.salaryRunId
                                  ? "Generate this person's salary run first"
                                  : row.remainder <= 0
                                    ? "Already settled"
                                    : "Record this incentive payout against the salary run"
                            }
                          >
                            {busy ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <HandCoins size={13} strokeWidth={2.5} />
                            )}
                            {busy ? "Paying…" : "Pay with Salary"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          {board.rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-hairline-strong font-bold text-ink-strong">
                <td className="px-5 py-3">Totals</td>
                <Td align="right" muted>{formatInr(board.totals.booked)}</Td>
                <Td align="right">{formatInr(board.totals.accrued)}</Td>
                <Td align="right" strong>{formatInr(board.totals.payable)}</Td>
                <Td align="right">{formatInr(board.totals.paid)}</Td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: board.totals.remainder > 0 ? AMBER : GREEN_DEEP }}>
                  {formatInr(board.totals.remainder)}
                </td>
                <td className="px-4 py-3 text-right text-[12px] font-semibold text-ink-subtle">
                  {board.totals.payableRows} to pay
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function Th({
  id,
  ctl,
  label,
  children,
  align,
}: {
  id: string;
  ctl: ColumnOrderControl;
  /** Accessible column name — the header itself is an icon + text run. */
  label: string;
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <ReorderableTh
      id={id}
      ctl={ctl}
      label={label}
      className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </ReorderableTh>
  );
}

function Td({
  children,
  align,
  strong,
  muted,
}: {
  children: React.ReactNode;
  align?: "right";
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 tabular-nums ${align === "right" ? "text-right" : ""} ${
        strong ? "font-bold text-ink-strong" : muted ? "text-ink-subtle" : "text-ink-soft"
      }`}
    >
      {children}
    </td>
  );
}
