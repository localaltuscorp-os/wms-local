"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { formatDMonY, formatInr } from "@/lib/format";
import { IncentiveBadge } from "@/components/incentive/ui/badges";
import { toneInk, type Tone } from "@/components/incentive/ui/tone";
import type {
  IncentiveAccountsRow,
  IncentiveAccountsStatus,
} from "@/lib/queries/incentive-accounts";

const STATUS: Record<IncentiveAccountsStatus, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "teal" },
  part_paid: { label: "Part paid", tone: "amber" },
  unpaid: { label: "Unpaid", tone: "slate" },
  reversed: { label: "Reversed", tone: "red" },
};

/** Negative money reads as money to recover, so it is never plain ink. */
function Money({ value, sign }: { value: number; sign?: boolean }) {
  const negative = value < 0;
  return (
    <span
      className="text-[13px] font-bold tabular-nums"
      style={{ color: negative ? toneInk("red") : undefined }}
    >
      {sign && value > 0 ? "+" : ""}
      {formatInr(value)}
    </span>
  );
}

const columns: DataTableColumn<IncentiveAccountsRow>[] = [
  {
    key: "employee",
    label: "Employee",
    sortValue: (r) => r.employeeName.toLowerCase(),
    render: (r) => <span className="text-[13.5px] font-semibold text-ink-strong">{r.employeeName}</span>,
  },
  {
    key: "incentive",
    label: "Incentive",
    sortValue: (r) => r.incentiveName.toLowerCase(),
    render: (r) => <span className="text-[13px] text-ink-soft">{r.incentiveName}</span>,
  },
  {
    key: "date",
    label: "Incentive date",
    sortValue: (r) => r.entryDate ?? r.periodMonth ?? "",
    render: (r) => (
      <span className="text-[13px] tabular-nums text-ink-soft">
        {r.entryDate ? formatDMonY(r.entryDate) : r.periodMonth ? formatDMonY(r.periodMonth) : "—"}
      </span>
    ),
  },
  { key: "due", label: "Approved / Due", align: "right", sortValue: (r) => r.due, render: (r) => <Money value={r.due} /> },
  { key: "paid", label: "Paid", align: "right", sortValue: (r) => r.paid, render: (r) => <Money value={r.paid} /> },
  {
    key: "unpaid",
    label: "Unpaid",
    align: "right",
    sortValue: (r) => r.unpaid,
    render: (r) => <Money value={r.unpaid} />,
  },
  {
    key: "reversal",
    label: "Reversal adj.",
    align: "right",
    sortValue: (r) => r.reversal,
    render: (r) =>
      r.reversal === 0 ? (
        <span className="text-[13px] text-ink-subtle">—</span>
      ) : (
        <Money value={r.reversal} sign />
      ),
  },
  {
    key: "final",
    label: "Final payable",
    align: "right",
    sortValue: (r) => r.finalPayable,
    render: (r) => <Money value={r.finalPayable} />,
  },
  {
    key: "status",
    label: "Payment status",
    sortValue: (r) => STATUS[r.status].label,
    render: (r) => <IncentiveBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</IncentiveBadge>,
  },
  {
    key: "paidDate",
    label: "Paid on",
    sortValue: (r) => r.paidDate ?? "",
    render: (r) => (
      <span className="text-[13px] tabular-nums text-ink-soft">
        {r.paidDate ? formatDMonY(r.paidDate) : "—"}
      </span>
    ),
  },
];

/**
 * The Accounts incentive ledger.
 *
 * Read-only by design: paying happens on the payout board under its own admin
 * gate and feature flag, so this screen never offers a second door to the same
 * money. The row link opens that board.
 */
export function IncentiveAccountsTable({ rows }: { rows: IncentiveAccountsRow[] }) {
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.entryId}
      searchText={(r) => `${r.employeeName} ${r.incentiveName}`}
      searchPlaceholder="Local search — employee or incentive"
      initialSort={{ key: "date", dir: "desc" }}
      stickyFirstColumn
      dense
      pageSize={25}
      filters={[
        {
          label: "Status",
          options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
          match: (r, v) => r.status === v,
        },
        {
          label: "Reversal",
          options: [
            { value: "yes", label: "Has reversal" },
            { value: "no", label: "No reversal" },
          ],
          match: (r, v) => (v === "yes" ? r.reversal < 0 : r.reversal === 0),
        },
      ]}
      rowActions={(r) => (
        <Link
          href={"/salary/incentive-payout" as Route}
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-muted hover:text-ink-strong"
          aria-label={`Open the incentive payout board (${r.employeeName})`}
        >
          Pay board
          <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
        </Link>
      )}
      footerRow={
        <tr className="border-t border-hairline-strong">
          <td className="px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-strong">
            Total
          </td>
          <td />
          <td />
          <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
            {formatInr(rows.reduce((s, r) => s + r.due, 0))}
          </td>
          <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
            {formatInr(rows.reduce((s, r) => s + r.paid, 0))}
          </td>
          <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
            {formatInr(rows.reduce((s, r) => s + r.unpaid, 0))}
          </td>
          <td
            className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums"
            style={{ color: toneInk("red") }}
          >
            {formatInr(rows.reduce((s, r) => s + r.reversal, 0))}
          </td>
          <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
            {formatInr(rows.reduce((s, r) => s + r.finalPayable, 0))}
          </td>
          <td />
          <td />
        </tr>
      }
    />
  );
}
