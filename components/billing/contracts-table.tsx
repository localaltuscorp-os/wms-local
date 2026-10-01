"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { CSSProperties } from "react";
import { Ban, Eye, Paperclip, Pencil, Play, Search, Square, Trash2, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { MultiFilter } from "@/components/ui/multi-filter";
import { ColumnsMenu, GroupByControl, Pager, TableToolbar, useHiddenColumns } from "@/components/billing/table-toolbar";
import { SelectionBar, barBtn, barBtnDanger, useRowSelection } from "@/components/billing/selection-bar";
import { BILLING_PURPLE_DEEP, CARD_STYLE, rupees } from "@/lib/billing/ui";
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

type ContractGroupKey = "none" | "customer" | "paymentType" | "status" | "entity" | "year";

const CONTRACT_GROUPS: { key: ContractGroupKey; label: string; get: (contract: ContractSummary) => string }[] = [
  { key: "none", label: "No grouping", get: () => "" },
  { key: "customer", label: "Customer", get: (contract) => contract.customerName },
  { key: "paymentType", label: "Payment type", get: (contract) => CONTRACT_PAYMENT_TYPE_LABELS[contract.paymentType] },
  { key: "status", label: "Status", get: (contract) => CONTRACT_STATUS_LABELS[contract.status] },
  { key: "entity", label: "Entity", get: (contract) => contract.entityId },
  { key: "year", label: "Start year", get: (contract) => contract.startDate.slice(0, 4) },
];

const CONTRACT_COLUMNS = [
  { key: "client", label: "Client" }, { key: "payment", label: "Payment Type" },
  { key: "period", label: "Period" }, { key: "value", label: "Contract Value" },
  { key: "billed", label: "Billed" }, { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" }, { key: "notDue", label: "Not Due" },
  { key: "pdcs", label: "PDCs" }, { key: "status", label: "Status" },
] as const;
type ContractColumnKey = (typeof CONTRACT_COLUMNS)[number]["key"];

export function ContractsTable({
  rows,
  entityNames,
  initialMetric,
}: {
  rows: ContractSummary[];
  /** entityId → display name, resolved on the server. */
  entityNames: Record<string, string>;
  initialMetric?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [groupBy, setGroupBy] = React.useState<ContractGroupKey>("none");
  const [query, setQuery] = React.useState("");
  const [paymentTypes, setPaymentTypes] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [customers, setCustomers] = React.useState<string[]>([]);
  const [entities, setEntities] = React.useState<string[]>([]);
  const [years, setYears] = React.useState<string[]>([]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const metric = ["billed", "paid", "unpaid", "not_due"].includes(initialMetric ?? "") ? initialMetric : null;
  const { hidden, toggle: toggleColumn } = useHiddenColumns<ContractColumnKey>();

  const group = CONTRACT_GROUPS.find((item) => item.key === groupBy)!;
  const filteredRows = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = rows.filter((contract) => {
      if (term && !`${contract.customerName} ${entityNames[contract.entityId] ?? ""}`.toLowerCase().includes(term)) return false;
      if (paymentTypes.length && !paymentTypes.includes(contract.paymentType)) return false;
      if (statuses.length && !statuses.includes(contract.status)) return false;
      if (customers.length && !customers.includes(contract.customerId)) return false;
      if (entities.length && !entities.includes(contract.entityId)) return false;
      if (years.length && !years.includes(contract.startDate.slice(0, 4))) return false;
      if (metric === "billed" && contract.billedAmount <= 0) return false;
      if (metric === "paid" && contract.buckets.paid.count === 0) return false;
      if (metric === "unpaid" && contract.buckets.unpaid.count === 0) return false;
      if (metric === "not_due" && contract.buckets.notDue.count === 0) return false;
      return true;
    });
    return groupBy === "none" ? filtered : [...filtered].sort((a, b) => group.get(a).localeCompare(group.get(b)));
  }, [customers, entities, entityNames, group, groupBy, metric, paymentTypes, query, rows, statuses, years]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageRows = filteredRows.slice(safePageIndex * pageSize, (safePageIndex + 1) * pageSize);
  const sel = useRowSelection(pageRows.map((r) => r.id));
  const selectedRows = pageRows.filter((r) => sel.selected.has(r.id));
  const activeFilters = paymentTypes.length + statuses.length + customers.length + entities.length + years.length;
  const customerOptions = React.useMemo(
    () => [...new Map(rows.map((r) => [r.customerId, r.customerName])).entries()].map(([value, label]) => ({ value, label })),
    [rows],
  );
  const entityOptions = React.useMemo(
    () => [...new Set(rows.map((r) => r.entityId))].map((value) => ({ value, label: entityNames[value] ?? value })),
    [entityNames, rows],
  );
  const yearOptions = React.useMemo(
    () => [...new Set(rows.map((r) => r.startDate.slice(0, 4)))].sort().reverse(),
    [rows],
  );

  function clearFilters() {
    setPaymentTypes([]); setStatuses([]); setCustomers([]); setEntities([]); setYears([]); setQuery(""); setPageIndex(0);
  }

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
    <div className="space-y-4">
      <TableToolbar
        left={
          <>
            <GroupByControl noun="contracts" options={CONTRACT_GROUPS} value={groupBy} onChange={(value) => { setGroupBy(value); setPageIndex(0); }} />
            <CollapsibleSearch scope="contracts">
              <div className="relative w-[220px] shrink-0">
                <Search size={16} strokeWidth={2.2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }}
                  placeholder="Search customer or entity…"
                  aria-label="Search contracts"
                  className="h-8 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-3 text-[12.5px] text-ink-strong outline-none placeholder:text-ink-subtle focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
                />
              </div>
            </CollapsibleSearch>
            <MultiFilter allLabel="Payment type" values={paymentTypes} onChange={(value) => { setPaymentTypes(value); setPageIndex(0); }} options={Object.entries(CONTRACT_PAYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))} className="h-8 max-w-[150px] rounded-pill border bg-surface-card pl-2.5 pr-1.5 text-[12px] font-bold text-ink-soft" />
            <MultiFilter allLabel="Status" values={statuses} onChange={(value) => { setStatuses(value); setPageIndex(0); }} options={Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))} className="h-8 max-w-[150px] rounded-pill border bg-surface-card pl-2.5 pr-1.5 text-[12px] font-bold text-ink-soft" />
            <MultiFilter allLabel="Customer" values={customers} onChange={(value) => { setCustomers(value); setPageIndex(0); }} options={customerOptions} className="h-8 max-w-[150px] rounded-pill border bg-surface-card pl-2.5 pr-1.5 text-[12px] font-bold text-ink-soft" />
            <MultiFilter allLabel="Entity" values={entities} onChange={(value) => { setEntities(value); setPageIndex(0); }} options={entityOptions} className="h-8 max-w-[150px] rounded-pill border bg-surface-card pl-2.5 pr-1.5 text-[12px] font-bold text-ink-soft" />
            <MultiFilter allLabel="Year" values={years} onChange={(value) => { setYears(value); setPageIndex(0); }} options={yearOptions} className="h-8 max-w-[120px] rounded-pill border bg-surface-card pl-2.5 pr-1.5 text-[12px] font-bold text-ink-soft" />
            {activeFilters > 0 || query ? <button type="button" onClick={clearFilters} className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-[12px] font-bold text-altus-red"><X size={13} strokeWidth={2.4} /> Clear filters</button> : null}
          </>
        }
        right={<><Pager pageIndex={safePageIndex} pageCount={pageCount} pageSize={pageSize} rangeStart={filteredRows.length === 0 ? 0 : safePageIndex * pageSize + 1} rangeEnd={Math.min(filteredRows.length, safePageIndex * pageSize + pageRows.length)} total={filteredRows.length} noun="contracts" onPage={setPageIndex} onPageSize={(value) => { setPageSize(value); setPageIndex(0); }} /><ColumnsMenu columns={[...CONTRACT_COLUMNS]} hidden={hidden} onToggle={toggleColumn} locked="client" /></>}
      />

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

      <div className="overflow-x-auto rounded-[22px]" style={CARD_STYLE}>
        <table className="w-full min-w-[1140px] whitespace-nowrap border-separate border-spacing-0 text-[13px]">
          <thead className="[&>tr>th]:!px-4 [&>tr>th]:!py-3">
            <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              <th className="w-10 !pl-4 !pr-1 text-left">
                <Checkbox
                  checked={sel.allOn}
                  indeterminate={sel.someOn}
                  onChange={sel.toggleAll}
                  ariaLabel="Select all contracts"
                />
              </th>
              <th>Client</th>
              <th>Payment Type</th>
              <th>Period</th>
              <th className="text-right">Contract Value</th>
              <th className="text-right">Billed</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Unpaid</th>
              <th className="text-right">Not Due</th>
              <th className="text-right">PDCs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => {
              const on = sel.selected.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={on ? "bg-[color:color-mix(in_srgb,var(--color-altus-red)_5%,transparent)]" : undefined}
                >
                  <td className="border-t border-hairline py-3 pl-4 pr-1">
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
    </div>
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
