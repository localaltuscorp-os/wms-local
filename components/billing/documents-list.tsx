"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ChevronDown,
  RotateCcw,
  Download,
  Mail,
  Pencil,
  Eye,
  Sparkles,
  ArrowRightLeft,
  BadgeIndianRupee,
  Ban,
  Search,
  FilePlus2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar, barBtn, barBtnDanger, useRowSelection } from "@/components/billing/selection-bar";
import { Select } from "@/components/ui/select";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import {
  ColumnsMenu,
  FilterPill,
  GroupByControl,
  Pager,
  TableToolbar,
  toolbarPill,
  useHiddenColumns,
} from "@/components/billing/table-toolbar";
import { fireToast } from "@/lib/toast";
import {
  BILLING_DOC_STATUSES,
  BILLING_DOC_STATUS_LABELS,
  BILLING_DOC_TYPES,
  BILLING_DOC_TYPE_LABELS,
  type BillingDocType,
} from "@/db/enums";
import { CONVERSION_TARGETS } from "@/lib/billing/numbering";
import { fmtDocDate } from "@/lib/billing/view-model";
import { CARD_STYLE, rupees, BILLING_PURPLE } from "@/lib/billing/ui";
import { DocTypeChip, StatusBadge } from "@/components/billing/chips";
import {
  cancelBillingDocumentAction,
  convertBillingDocumentAction,
  generateBillingDocumentAction,
  markBillingDocumentPaidAction,
  archiveBillingDocumentAction,
} from "@/app/(app)/billing/documents/actions";
import type { BillingDocumentRow } from "@/lib/queries/billing-documents";

/**
 * BILLING — the document ledger.
 *
 * Every filter lives in the URL, so a filtered view is a link someone can send.
 * Actions live in the selection bar, not a per-row menu: tick rows, and the bar
 * offers what makes sense for them. Each goes through the same server action
 * the detail page uses — there is no second code path hiding in the table.
 */

interface Props {
  rows: BillingDocumentRow[];
  total: number;
  /** 1-based page and its size — both come from the URL (?page=&size=). */
  page: number;
  pageSize: number;
  customers: { id: string; name: string }[];
  entities: { id: string; label: string }[];
  finYears: string[];
}

export function BillingDocumentsList({
  rows,
  total,
  page,
  pageSize,
  customers,
  entities,
  finYears,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const showArchived = params.get("archived") === "true";
  const [pending, setPending] = React.useState(false);
  const sel = useRowSelection(rows.map((r) => r.id));
  const [q, setQ] = React.useState(params.get("q") ?? "");

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // A new filter changes what page 3 means, so any change but paging
      // itself lands back on page 1.
      if (key !== "page") next.delete("page");
      router.push(`/billing/documents${next.toString() ? `?${next}` : ""}` as Route);
    },
    [params, router],
  );

  // Debounced search, so typing does not fire a navigation per keystroke.
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q.trim() || null), 350);
    return () => clearTimeout(t);
  }, [q, params, setParam]);

  /** Run one action over every selected document, one at a time. */
  async function runMany(
    targets: BillingDocumentRow[],
    label: (done: number) => string,
    fn: (row: BillingDocumentRow) => Promise<{ ok: boolean; error?: string }>,
  ) {
    if (targets.length === 0) return;
    setPending(true);
    let done = 0;
    const errors: string[] = [];
    try {
      for (const row of targets) {
        const result = await fn(row).catch(() => ({ ok: false, error: "That did not work." }));
        if (result.ok) done++;
        else errors.push(`${row.docNo ?? "Draft"}: ${result.error ?? "failed"}`);
      }
      if (done > 0) fireToast({ message: label(done), type: "success" });
      if (errors.length > 0) fireToast({ message: errors.join(" · "), type: "error" });
      sel.clear();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const selectedRows = rows.filter((r) => sel.selected.has(r.id));

  /* ── Group By · paging · columns ─────────────────────────────────────── */
  const [groupBy, setGroupBy] = React.useState<DocGroupKey>("none");
  const { hidden, toggle: toggleColumn } = useHiddenColumns<DocColKey>();
  const visibleCols = DOC_COLUMNS.filter((c) => !hidden.has(c.key));
  const group = DOC_GROUPS.find((g) => g.key === groupBy)!;
  // Grouping orders the CURRENT PAGE by group; the server pages by date.
  const shown = React.useMemo(
    () => (groupBy === "none" ? rows : [...rows].sort((a, b) => group.get(a).localeCompare(group.get(b)))),
    [rows, groupBy, group],
  );
  const groupCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    if (groupBy !== "none") for (const r of shown) m.set(group.get(r), (m.get(group.get(r)) ?? 0) + 1);
    return m;
  }, [shown, groupBy, group]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageIndex = Math.min(page, pageCount) - 1;
  const rangeStart = total === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(total, pageIndex * pageSize + rows.length);

  const activeFilters = ["type", "status", "customerId", "entityId", "finYear"].filter((k) => params.get(k)).length;
  function clearFilters() {
    const next = new URLSearchParams(params.toString());
    for (const k of ["type", "status", "customerId", "entityId", "finYear", "page"]) next.delete(k);
    router.push(`/billing/documents${next.toString() ? `?${next}` : ""}` as Route);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — Group By ▾ · Search · filters · Archived · Pager · Columns,
          the same rail as the Customer Master and the task list. */}
      <TableToolbar
        left={
          <>
            <GroupByControl noun="documents" options={DOC_GROUPS} value={groupBy} onChange={setGroupBy} />
            <CollapsibleSearch scope="documents">
              <div className="relative w-[220px] shrink-0">
                <Search
                  size={16}
                  strokeWidth={2.2}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
                />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search number, customer or remarks…"
                  aria-label="Search documents"
                  className="h-8 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-3 text-[12.5px] text-ink-strong outline-none placeholder:text-ink-subtle focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
                />
              </div>
            </CollapsibleSearch>
            <FilterPill
              label="Type"
              value={params.get("type") ?? ""}
              onChange={(v) => setParam("type", v || null)}
              options={[
                { value: "", label: "Type" },
                ...BILLING_DOC_TYPES.map((t) => ({ value: t, label: BILLING_DOC_TYPE_LABELS[t] })),
              ]}
            />
            <FilterPill
              label="Status"
              value={params.get("status") ?? ""}
              onChange={(v) => setParam("status", v || null)}
              options={[
                { value: "", label: "Status" },
                ...BILLING_DOC_STATUSES.map((st) => ({ value: st, label: BILLING_DOC_STATUS_LABELS[st] })),
              ]}
            />
            {/* Customer keeps the searchable picker — there can be hundreds. */}
            <div className="w-[150px] shrink-0">
              <Select
                options={[
                  { value: "", label: "Customer" },
                  ...customers.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={params.get("customerId") ?? ""}
                onValueChange={(v) => setParam("customerId", v || null)}
                searchable
                ariaLabel="Customer"
                className={
                  params.get("customerId")
                    ? "h-8 rounded-pill border-altus-red bg-altus-red/10 px-2.5 text-[12px] font-bold text-altus-red"
                    : "h-8 rounded-pill border-hairline bg-surface-card px-2.5 text-[12px] font-bold text-ink-soft"
                }
              />
            </div>
            <FilterPill
              label="Entity"
              value={params.get("entityId") ?? ""}
              onChange={(v) => setParam("entityId", v || null)}
              options={[{ value: "", label: "Entity" }, ...entities.map((e) => ({ value: e.id, label: e.label }))]}
            />
            <FilterPill
              label="Financial year"
              value={params.get("finYear") ?? ""}
              onChange={(v) => setParam("finYear", v || null)}
              options={[{ value: "", label: "Year" }, ...finYears.map((y) => ({ value: y, label: `FY ${y}` }))]}
            />
            {/* ARCHIVED — a SWAP, not another filter: pressed, the list shows
                the filed documents INSTEAD of the live ones. */}
            <button
              type="button"
              onClick={() => setParam("archived", showArchived ? null : "true")}
              aria-pressed={showArchived}
              title={showArchived ? "Back to the live documents" : "Show the documents that have been filed away"}
              className={`${toolbarPill} ${
                showArchived
                  ? "border-altus-red bg-altus-red/10 text-altus-red"
                  : "border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong"
              }`}
            >
              <Archive size={13} strokeWidth={2.2} /> Archived
            </button>
            {activeFilters > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-[12px] font-bold text-altus-red"
              >
                <X size={13} strokeWidth={2.4} /> Clear filters
              </button>
            ) : null}
          </>
        }
        right={
          <>
            <Pager
              pageIndex={pageIndex}
              pageCount={pageCount}
              pageSize={pageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              total={total}
              noun="documents"
              onPage={(i) => setParam("page", i > 0 ? String(i + 1) : null)}
              onPageSize={(n) => setParam("size", n === 20 ? null : String(n))}
            />
            <ColumnsMenu columns={DOC_COLUMNS} hidden={hidden} onToggle={toggleColumn} locked="document" />
          </>
        }
      />

      <SelectionBar count={selectedRows.length} pending={pending} onClear={sel.clear}>
        <DocSelectionActions rows={selectedRows} pending={pending} runMany={runMany} />
      </SelectionBar>

      {/* Table --------------------------------------------------------- */}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-[22px]" style={CARD_STYLE}>
          <table
            className="w-full border-collapse text-[13px] max-md:hidden"
            style={{ minWidth: 120 + visibleCols.length * 90 }}
          >
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.12em] text-ink-muted">
                <th className="w-10 py-3 pl-4 pr-1 text-left">
                  <Checkbox
                    checked={sel.allOn}
                    indeterminate={sel.someOn}
                    onChange={sel.toggleAll}
                    ariaLabel="Select all documents"
                  />
                </th>
                {visibleCols.map((c) => (
                  <th key={c.key} className={`px-4 py-3 font-bold ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, idx) => {
                const key = groupBy === "none" ? null : group.get(row);
                const startsGroup = key !== null && (idx === 0 || group.get(shown[idx - 1]!) !== key);
                return (
                  <React.Fragment key={row.id}>
                    {startsGroup ? (
                      <tr className="border-t border-hairline bg-[rgba(15,23,42,0.035)]">
                        <td colSpan={visibleCols.length + 1} className="px-4 py-2 text-[12px] font-black text-ink-strong">
                          {group.label}: {key}
                          <span className="ml-2 rounded-pill bg-white px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                            {groupCounts.get(key!) ?? 0}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      className="border-t border-hairline transition-colors"
                      style={sel.selected.has(row.id) ? { background: "rgba(225,6,0,0.06)" } : undefined}
                    >
                      <td className="py-3 pl-4 pr-1">
                        <Checkbox
                          checked={sel.selected.has(row.id)}
                          onChange={(on) => sel.toggle(row.id, on)}
                          ariaLabel={`Select ${row.docNo ?? "draft"}`}
                        />
                      </td>
                      {visibleCols.map((c) => (
                        <td key={c.key} className={c.cellClass}>
                          {c.render(row)}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Phone: one card per document. */}
          <ul className="divide-y divide-hairline md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Checkbox
                    checked={sel.selected.has(row.id)}
                    onChange={(on) => sel.toggle(row.id, on)}
                    ariaLabel={`Select ${row.docNo ?? "draft"}`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/billing/documents/${row.id}` as Route}
                      className="font-bold underline-offset-4 hover:underline"
                    >
                      {row.docNo ?? "Draft"}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DocTypeChip type={row.docType} />
                      <StatusBadge status={row.status} isOverdue={row.isOverdue} />
                    </div>
                    <div className="mt-1.5 text-[13px] font-semibold">{row.customerName}</div>
                    <div className="text-[12px] text-ink-muted">{fmtDocDate(row.docDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black tabular-nums">{rupees(row.total)}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type RunMany = (
  targets: BillingDocumentRow[],
  label: (done: number) => string,
  fn: (row: BillingDocumentRow) => Promise<{ ok: boolean; error?: string }>,
) => Promise<void>;

/**
 * The selection bar's buttons. Open / Edit / PDF / Email / Convert act on ONE
 * document, so they wait for a single selection; Generate, Mark paid, Archive
 * and Cancel run over every selected document the action applies to, and say
 * so in their label.
 */
function DocSelectionActions({
  rows,
  pending,
  runMany,
}: {
  rows: BillingDocumentRow[];
  pending: boolean;
  runMany: RunMany;
}) {
  const one = rows.length === 1 ? rows[0]! : null;

  const isEditable = (r: BillingDocumentRow) =>
    r.status === "draft" || (r.status === "generated" && r.docType !== "tax_invoice");
  const canGenerate = (r: BillingDocumentRow) => !r.docNo && r.status === "draft";
  const canSend = (r: BillingDocumentRow) => Boolean(r.docNo) && r.status !== "cancelled";
  const canPay = (r: BillingDocumentRow) =>
    Boolean(r.docNo) && r.status !== "cancelled" && r.status !== "paid";
  const canCancel = (r: BillingDocumentRow) => r.status !== "cancelled";
  const convertTargets: BillingDocType[] =
    one && one.docNo && (one.status === "generated" || one.status === "sent" || one.status === "paid")
      ? CONVERSION_TARGETS[one.docType]
      : [];

  const toGenerate = rows.filter(canGenerate);
  const toPay = rows.filter(canPay);
  const toCancel = rows.filter(canCancel);
  // Archive when anything selected is live; Restore when all of it is filed.
  const allArchived = rows.length > 0 && rows.every((r) => r.archived);
  const count = (list: BillingDocumentRow[]) => (rows.length > 1 && list.length > 0 ? ` (${list.length})` : "");
  const docs = (n: number) => `${n} document${n === 1 ? "" : "s"}`;
  const off = (enabled: boolean) => (enabled ? "" : " pointer-events-none opacity-50");

  return (
    <>
      <Link
        href={(one ? `/billing/documents/${one.id}` : "#") as Route}
        aria-disabled={!one}
        className={barBtn + off(Boolean(one))}
      >
        <Eye size={14} strokeWidth={2.2} /> View
      </Link>
      <Link
        href={(one ? `/billing/documents/${one.id}/edit` : "#") as Route}
        aria-disabled={!(one && isEditable(one))}
        className={barBtn + off(Boolean(one && isEditable(one)))}
      >
        <Pencil size={14} strokeWidth={2.2} /> Edit
      </Link>
      <a
        href={one?.docNo ? `/billing/documents/${one.id}/pdf?download=1` : undefined}
        aria-disabled={!one?.docNo}
        className={barBtn + off(Boolean(one?.docNo))}
      >
        <Download size={14} strokeWidth={2.2} /> Download PDF
      </a>
      <Link
        href={(one && canSend(one) ? `/billing/documents/${one.id}/email` : "#") as Route}
        aria-disabled={!(one && canSend(one))}
        className={barBtn + off(Boolean(one && canSend(one)))}
      >
        <Mail size={14} strokeWidth={2.2} /> Send email
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending || convertTargets.length === 0} className={barBtn}>
            <ArrowRightLeft size={14} strokeWidth={2.2} />
            Convert
            <ChevronDown size={13} className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {convertTargets.map((to) => (
            <DropdownMenuItem
              key={to}
              onSelect={() =>
                one &&
                void runMany(
                  [one],
                  () => `Converted to a ${BILLING_DOC_TYPE_LABELS[to].toLowerCase()} draft.`,
                  (r) => convertBillingDocumentAction({ sourceId: r.id, toType: to }),
                )
              }
            >
              {BILLING_DOC_TYPE_LABELS[to]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="mx-1 h-5 w-px shrink-0 bg-hairline" aria-hidden />

      <button
        type="button"
        className={barBtn}
        disabled={pending || toGenerate.length === 0}
        onClick={() =>
          void runMany(toGenerate, (n) => `${docs(n)} generated.`, (r) =>
            generateBillingDocumentAction({ id: r.id }),
          )
        }
      >
        <Sparkles size={14} strokeWidth={2.2} /> Generate{count(toGenerate)}
      </button>
      <button
        type="button"
        className={barBtn}
        disabled={pending || toPay.length === 0}
        onClick={() =>
          void runMany(toPay, (n) => `${docs(n)} marked paid.`, (r) =>
            markBillingDocumentPaidAction({
              id: r.id,
              paidAmount: String(r.total),
              paidAt: new Date().toISOString().slice(0, 10),
            }),
          )
        }
      >
        <BadgeIndianRupee size={14} strokeWidth={2.2} /> Mark paid{count(toPay)}
      </button>
      {/* ARCHIVE — kept apart from Cancel, because the two are constantly
          mistaken for each other and only one is reversible. Cancel VOIDS a
          document; this only decides whether the list shows it. */}
      <button
        type="button"
        className={barBtn}
        disabled={pending || rows.length === 0}
        onClick={() =>
          void runMany(
            allArchived ? rows : rows.filter((r) => !r.archived),
            (n) => `${docs(n)} ${allArchived ? "restored" : "archived"}.`,
            (r) => archiveBillingDocumentAction({ id: r.id, archived: !allArchived }),
          )
        }
      >
        {allArchived ? (
          <>
            <RotateCcw size={14} strokeWidth={2.2} /> Restore
          </>
        ) : (
          <>
            <Archive size={14} strokeWidth={2.2} /> Archive
          </>
        )}
      </button>
      <button
        type="button"
        className={barBtnDanger}
        disabled={pending || toCancel.length === 0}
        onClick={() => {
          const reason = window.prompt(
            toCancel.length === 1
              ? "Why is this document being cancelled?"
              : `Why are these ${toCancel.length} documents being cancelled?`,
          );
          if (!reason?.trim()) return;
          void runMany(toCancel, (n) => `${docs(n)} cancelled.`, (r) =>
            cancelBillingDocumentAction({ id: r.id, reason }),
          );
        }}
      >
        <Ban size={14} strokeWidth={2.2} /> Cancel{count(toCancel)}
      </button>
    </>
  );
}

/* ─────────────────────────── columns & groups ──────────────────────────── */

type DocColKey = "document" | "customer" | "date" | "due" | "taxable" | "gst" | "total" | "status" | "createdBy";

const DOC_COLUMNS: {
  key: DocColKey;
  label: string;
  align?: "right";
  cellClass: string;
  render: (r: BillingDocumentRow) => React.ReactNode;
}[] = [
  {
    key: "document",
    label: "Document",
    cellClass: "px-4 py-3",
    render: (r) => (
      <>
        <Link
          href={`/billing/documents/${r.id}` as Route}
          className="font-bold text-ink-strong underline-offset-4 hover:underline"
        >
          {r.docNo ?? "Draft"}
        </Link>
        <div className="mt-1">
          <DocTypeChip type={r.docType} />
        </div>
      </>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    cellClass: "px-4 py-3",
    render: (r) => (
      <>
        <div className="font-semibold">{r.customerName}</div>
        {r.customerEmail ? <div className="text-[11.5px] text-ink-muted">{r.customerEmail}</div> : null}
      </>
    ),
  },
  { key: "date", label: "Date", cellClass: "px-4 py-3 text-ink-muted", render: (r) => fmtDocDate(r.docDate) },
  {
    key: "due",
    label: "Due",
    cellClass: "px-4 py-3 text-ink-muted",
    render: (r) => (r.dueDate ? fmtDocDate(r.dueDate) : "—"),
  },
  {
    key: "taxable",
    label: "Taxable",
    align: "right",
    cellClass: "px-4 py-3 text-right tabular-nums",
    render: (r) => rupees(r.taxableValue),
  },
  {
    key: "gst",
    label: "GST",
    align: "right",
    cellClass: "px-4 py-3 text-right tabular-nums text-ink-muted",
    render: (r) => (r.taxTotal > 0 ? rupees(r.taxTotal) : "—"),
  },
  {
    key: "total",
    label: "Total",
    align: "right",
    cellClass: "px-4 py-3 text-right font-black tabular-nums",
    render: (r) => rupees(r.total),
  },
  {
    key: "status",
    label: "Status",
    cellClass: "px-4 py-3",
    render: (r) => <StatusBadge status={r.status} isOverdue={r.isOverdue} />,
  },
  { key: "createdBy", label: "Created by", cellClass: "px-4 py-3 text-ink-muted", render: (r) => r.createdByName ?? "—" },
];

type DocGroupKey = "none" | "type" | "status" | "customer" | "entity" | "finYear" | "createdBy";

const DOC_GROUPS: { key: DocGroupKey; label: string; get: (r: BillingDocumentRow) => string }[] = [
  { key: "none", label: "None", get: () => "" },
  { key: "type", label: "Type", get: (r) => BILLING_DOC_TYPE_LABELS[r.docType] },
  { key: "status", label: "Status", get: (r) => BILLING_DOC_STATUS_LABELS[r.status] ?? r.status },
  { key: "customer", label: "Customer", get: (r) => r.customerName || "No customer" },
  { key: "entity", label: "Entity", get: (r) => r.entityId },
  { key: "finYear", label: "Financial year", get: (r) => `FY ${r.finYear}` },
  { key: "createdBy", label: "Created by", get: (r) => r.createdByName ?? "Unknown" },
];


function EmptyState() {
  return (
    <div className="rounded-[22px] px-6 py-14 text-center" style={CARD_STYLE}>
      <FilePlus2 size={26} className="mx-auto text-ink-muted" />
      <h2 className="mt-3 text-[16px] font-black text-ink-strong">No documents yet</h2>
      <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-ink-muted">
        Quotations, proforma invoices and tax invoices you raise will appear here, with their status
        and the trail behind each one.
      </p>
      <Link
        href={"/billing/documents/new" as Route}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
      >
        <FilePlus2 size={15} /> New document
      </Link>
    </div>
  );
}
