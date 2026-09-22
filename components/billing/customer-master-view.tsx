"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE } from "@/lib/billing/ui";
import { fireToast } from "@/lib/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import {
  ColumnsMenu,
  GroupByControl,
  Pager,
  TableToolbar,
  useHiddenColumns,
} from "@/components/billing/table-toolbar";
import { SelectionBar, barBtn, barBtnDanger, useRowSelection } from "@/components/billing/selection-bar";
import { MultiFilter } from "@/components/ui/multi-filter";
import { CustomerDetailBody, StatusLine } from "@/components/billing/customer-record";
import { customerToPrintData, openKycPrintView } from "@/lib/billing/kyc-print";
import {
  deleteCustomersAction,
  getCustomerDetailAction,
  setCustomersActiveAction,
} from "@/app/(app)/billing/customers/kyc-actions";
import type {
  CustomerDetail,
  CustomerMasterRow,
  CustomerStats,
} from "@/lib/queries/billing-customers";

/**
 * CUSTOMER MASTER.
 *
 * FILTERING IS IN THE BROWSER, not the URL or the server. A few hundred
 * clients is small enough to hold, and every filter is then instant and
 * combinable — which is what a screen with this many of them is for. If this
 * ever carries tens of thousands it wants server-side paging instead, and that
 * is the signal to change: a slow first paint, not the number of filters.
 */

const PILL =
  "h-8 max-w-[150px] rounded-pill border border-hairline bg-surface-card pl-2.5 pr-1.5 text-[12px] font-bold text-ink-soft";

export function CustomerMasterView({
  rows,
  stats,
  initialQuery = "",
  justAddedId = "",
}: {
  rows: CustomerMasterRow[];
  stats: CustomerStats;
  /** Seeds the search box — `?q=` from the KYC form's redirect. */
  initialQuery?: string;
  /** `?new=` from the KYC form's redirect: the client just onboarded. */
  justAddedId?: string;
}) {
  const [q, setQ] = React.useState(initialQuery);
  /**
   * Each filter holds a LIST now (Manan, 2026-09-21: "in drop down give
   * multiple select also as well in filters"). An EMPTY list means no filter,
   * which is what the old `ALL` sentinel meant — said without a magic string,
   * and without an "All" row that has to be kept out of every predicate.
   */
  const [sales, setSales] = React.useState<string[]>([]);
  const [industry, setIndustry] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<string[]>([]);
  const [gstin, setGstin] = React.useState<string[]>([]);
  const [bizCat, setBizCat] = React.useState<string[]>([]);
  const [tag, setTag] = React.useState<string[]>([]);

  /* JUST ONBOARDED. The client the KYC form sent us to, while the banner is
     still up. Dismissing it clears the seeded search too — the banner is the
     only thing on screen saying why the table is down to one row, so the two
     have to go together or the list looks broken. */
  const [showJustAdded, setShowJustAdded] = React.useState(true);
  const justAdded =
    showJustAdded && justAddedId ? rows.find((r) => r.id === justAddedId) ?? null : null;

  const uniq = (vals: (string | null)[]) =>
    [...new Set(vals.filter((v): v is string => Boolean(v?.trim())))].sort();
  const uniqAll = (vals: string[][]) => [...new Set(vals.flat().filter(Boolean))].sort();

  const filtered = rows.filter((r) => {
    const text = q.trim().toLowerCase();
    if (
      text &&
      ![
        r.name, r.clientCode, r.gstin, r.pan, r.contactName, r.contactPhone, r.contactWhatsapp,
        r.contactEmail, r.businessCategory, r.natureOfBusiness,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(text))
    )
      return false;
    // "One of the ticked ones" throughout. Status and GSTIN read oddly as
    // lists — there are only two choices each and ticking both is the same as
    // ticking neither — but they behave consistently with the rest and the
    // tiles below still drive them.
    if (sales.length > 0 && !sales.includes(r.salesPersonName ?? "")) return false;
    if (industry.length > 0 && !industry.some((i) => r.industryTypes.includes(i))) return false;
    if (status.length > 0 && !status.includes(r.isActive ? "Active" : "Inactive")) return false;
    if (gstin.length > 0 && !gstin.includes(r.gstin ? "With GSTIN" : "Without GSTIN")) return false;
    if (bizCat.length > 0 && !bizCat.includes(r.businessCategory ?? "")) return false;
    if (tag.length > 0 && !tag.some((t) => r.tags.includes(t))) return false;
    return true;
  });

  const router = useRouter();

  /* ── Group By · paging · columns ─────────────────────────────────────── */
  const [groupBy, setGroupBy] = React.useState<GroupKey>("none");
  const [pageSize, setPageSize] = React.useState<number>(20);
  const [pageIndex, setPageIndex] = React.useState(0);
  const { hidden, toggle: toggleColumn } = useHiddenColumns<ColKey>();
  const visibleCols = COLUMNS.filter((c) => !hidden.has(c.key));

  // Grouped lists are ordered by group first, so a group's rows sit together
  // across page boundaries rather than being scattered over every page.
  const ordered = React.useMemo(() => {
    const g = GROUPS.find((x) => x.key === groupBy);
    if (!g || groupBy === "none") return filtered;
    return [...filtered].sort((a, b) => g.get(a).localeCompare(g.get(b)));
  }, [filtered, groupBy]);

  const total = ordered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const pageRows = ordered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const rangeStart = total === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min(total, (safePage + 1) * pageSize);
  const groupCounts = React.useMemo(() => {
    const g = GROUPS.find((x) => x.key === groupBy);
    const m = new Map<string, number>();
    if (g && groupBy !== "none") for (const r of ordered) m.set(g.get(r), (m.get(g.get(r)) ?? 0) + 1);
    return m;
  }, [ordered, groupBy]);

  const activeFilters = [sales, industry, status, gstin, bizCat, tag].filter(
    (v) => v.length > 0,
  ).length;
  function resetFilters() {
    setSales([]); setIndustry([]);
    setStatus([]); setGstin([]); setBizCat([]); setTag([]);
  }

  const sel = useRowSelection(pageRows.map((r) => r.id));
  const selectedIds = [...sel.selected];
  const one = selectedIds.length === 1 ? rows.find((r) => r.id === selectedIds[0]) : undefined;
  const [pending, setPending] = React.useState(false);
  const [quick, setQuick] = React.useState<CustomerDetail | null>(null);

  async function loadOne(): Promise<CustomerDetail | null> {
    if (!one) return null;
    setPending(true);
    try {
      const r = await getCustomerDetailAction(one.id);
      if (!r.ok) {
        fireToast({ message: r.error, type: "error" });
        return null;
      }
      return r.customer;
    } finally {
      setPending(false);
    }
  }

  async function bulk(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    try {
      const r = await fn();
      if (!r.ok) {
        fireToast({ message: r.error ?? "That did not work.", type: "error" });
        return;
      }
      fireToast({ message: label, type: "success" });
      sel.clear();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  // Deactivate when any selected client is active; Activate when all are
  // already inactive — so the one button always does the useful thing.
  const selectedRows = rows.filter((r) => sel.selected.has(r.id));
  const anyActive = selectedRows.some((r) => r.isActive);
  const n = selectedIds.length;
  const plural = (k: number) => `${k} client${k === 1 ? "" : "s"}`;

  function exportCsv() {
    /* CSV, opened by Excel. Not a real .xlsx: the app has no spreadsheet
       writer on the client, and a CSV that opens correctly beats a renamed
       file that makes Excel complain before it shows anything. */
    // Built from COLUMNS, so the export always carries exactly the master's
    // fields — no address (that is the Address Book's export), nothing removed.
    const esc = (v: unknown) => {
      const t = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [
      COLUMNS.map((c) => esc(c.label)).join(","),
      ...filtered.map((r) => COLUMNS.map((c) => esc(c.text(r))).join(",")),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = window.document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `customer-master-${new Date().toISOString().slice(0, 10)}.csv`;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Billing</p>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(24px,2.8vw,34px)",
              letterSpacing: "-0.025em",
            }}
          >
            Customer Master
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <Download size={14} /> Export to Excel
          </button>
          <Link
            href={"/billing/customers/new" as Route}
            className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
          >
            <Plus size={15} /> New client
          </Link>
        </div>
      </header>

      {justAdded ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] px-4 py-3"
          style={{ background: "#ECFDF5", boxShadow: "inset 0 0 0 1px #6EE7B7" }}
        >
          <CheckCircle2 size={18} style={{ color: "#047857" }} />
          <p className="text-[13px] font-semibold" style={{ color: "#064E3B" }}>
            <b>{justAdded.name}</b> is onboarded
            {justAdded.clientCode ? <> as <b>{justAdded.clientCode}</b></> : null} and is in the
            Customer Master — the table below is filtered to it.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/billing/customers/${justAdded.id}` as Route}
              className="inline-flex h-9 items-center rounded-chip bg-white px-3 text-[12.5px] font-bold"
              style={{ color: "#047857", boxShadow: "inset 0 0 0 1px #6EE7B7" }}
            >
              Open the record
            </Link>
            <button
              type="button"
              onClick={() => {
                setShowJustAdded(false);
                setQ("");
                setPageIndex(0);
              }}
              className="inline-flex h-9 items-center rounded-chip px-3 text-[12.5px] font-bold"
              style={{ color: "#065F46" }}
            >
              Show all clients
            </button>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
        {/* CLICKABLE — each tile filters the table to what it counts, and the
            one in force is outlined. Total clears both filters. */}
        <Tile
          n={stats.total}
          label="Total clients"
          active={status.length === 0 && gstin.length === 0}
          onClick={() => { setStatus([]); setGstin([]); setPageIndex(0); }}
        />
        <Tile
          n={stats.active}
          label="Active"
          active={status.length === 1 && status[0] === "Active"}
          onClick={() => {
            // The tile is a shortcut to ONE value, so it replaces the selection
            // rather than adding to it — clicking "Active" should show exactly
            // the active clients, whatever was ticked before.
            setStatus(status.length === 1 && status[0] === "Active" ? [] : ["Active"]);
            setPageIndex(0);
          }}
        />
        <Tile
          n={stats.withGstin}
          label="With GSTIN"
          active={gstin.length === 1 && gstin[0] === "With GSTIN"}
          onClick={() => {
            setGstin(gstin.length === 1 && gstin[0] === "With GSTIN" ? [] : ["With GSTIN"]);
            setPageIndex(0);
          }}
        />
      </section>

      {/* Toolbar — Group By ▾ · Search · the nine filters · Pager · Columns, the
          same rail as the task list. A filter that is on turns red, and
          "Clear filters" appears while any is. */}
      <div className="mt-4">
      <TableToolbar
        left={
          <>
          <GroupByControl noun="clients" options={GROUPS} value={groupBy} onChange={(v) => { setGroupBy(v); setPageIndex(0); }} />
          <CollapsibleSearch scope="clients" defaultOpen={Boolean(initialQuery)}>
            <div className="relative w-[220px] shrink-0">
              <Search size={16} strokeWidth={2.2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                type="search"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPageIndex(0); }}
                placeholder="Search company, code, GSTIN, contact…"
                aria-label="Search clients"
                className="h-8 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-3 text-[12.5px] text-ink-strong outline-none placeholder:text-ink-subtle focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
              />
            </div>
          </CollapsibleSearch>
          <MultiFilter allLabel="Sales person" className={PILL} values={sales} onChange={(v) => { setSales(v); setPageIndex(0); }} options={uniq(rows.map((r) => r.salesPersonName))} />
          <MultiFilter allLabel="Industry type" className={PILL} values={industry} onChange={(v) => { setIndustry(v); setPageIndex(0); }} options={uniqAll(rows.map((r) => r.industryTypes))} />
          <MultiFilter allLabel="Status" className={PILL} values={status} onChange={(v) => { setStatus(v); setPageIndex(0); }} options={["Active", "Inactive"]} />
          <MultiFilter allLabel="GSTIN" className={PILL} values={gstin} onChange={(v) => { setGstin(v); setPageIndex(0); }} options={["With GSTIN", "Without GSTIN"]} />
          <MultiFilter allLabel="Business category" className={PILL} values={bizCat} onChange={(v) => { setBizCat(v); setPageIndex(0); }} options={uniq(rows.map((r) => r.businessCategory))} />
          <MultiFilter allLabel="Tags" className={PILL} values={tag} onChange={(v) => { setTag(v); setPageIndex(0); }} options={uniqAll(rows.map((r) => r.tags))} />
          {activeFilters > 0 ? (
            <button
              type="button"
              onClick={resetFilters}
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
            pageIndex={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={total}
            noun="clients"
            onPage={setPageIndex}
            onPageSize={(n) => { setPageSize(n); setPageIndex(0); }}
          />
          <ColumnsMenu columns={COLUMNS} hidden={hidden} onToggle={toggleColumn} locked="company" />
          </>
        }
      />
      </div>

      <div className="mt-4">
        <SelectionBar count={n} pending={pending} onClear={sel.clear}>
          <button
            type="button"
            className={barBtn}
            disabled={!one || pending}
            title={one ? undefined : "Select one client"}
            onClick={async () => {
              const c = await loadOne();
              if (c) setQuick(c);
            }}
          >
            <Eye size={14} strokeWidth={2.2} /> Quick View
          </button>
          <button
            type="button"
            className={barBtn}
            disabled={!one || pending}
            title={one ? undefined : "Select one client"}
            onClick={async () => {
              const c = await loadOne();
              if (c) openKycPrintView(customerToPrintData(c));
            }}
          >
            <FileDown size={14} strokeWidth={2.2} /> View form (PDF)
          </button>
          <Link
            href={(one ? `/billing/customers/${one.id}` : "#") as Route}
            aria-disabled={!one}
            className={barBtn + (one ? "" : " pointer-events-none opacity-50")}
          >
            <FileText size={14} strokeWidth={2.2} /> Full Record
          </Link>
          <Link
            href={(one ? `/billing/customers/${one.id}/edit` : "#") as Route}
            aria-disabled={!one}
            className={barBtn + (one ? "" : " pointer-events-none opacity-50")}
          >
            <Pencil size={14} strokeWidth={2.2} /> Edit
          </Link>
          <span className="mx-1 h-5 w-px shrink-0 bg-hairline" aria-hidden />
          <button
            type="button"
            className={anyActive ? barBtnDanger : barBtn}
            disabled={pending}
            onClick={() =>
              void bulk(
                anyActive ? `${plural(n)} deactivated.` : `${plural(n)} activated.`,
                () => setCustomersActiveAction({ ids: selectedIds, active: !anyActive }),
              )
            }
          >
            <Power size={14} strokeWidth={2.2} /> {anyActive ? "Deactivate" : "Activate"}
          </button>
          <button
            type="button"
            className={barBtnDanger}
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Move ${plural(n)} to the Recycle Bin? You can restore them from there.`)) return;
              void bulk(`${plural(n)} moved to the Recycle Bin.`, () =>
                deleteCustomersAction({ ids: selectedIds }),
              );
            }}
          >
            <Trash2 size={14} strokeWidth={2.2} /> Delete
          </button>
        </SelectionBar>
      </div>

      <div className="overflow-x-auto rounded-[22px]" style={CARD_STYLE}>
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 120 + visibleCols.length * 80 }}>
          <thead>
            <tr className="bg-[#EEF1F5] text-[10.5px] uppercase tracking-[0.1em] text-ink-muted">
              <th className="w-10 py-2.5 pl-4 pr-1 text-left align-middle">
                <Checkbox
                  checked={sel.allOn}
                  indeterminate={sel.someOn}
                  onChange={sel.toggleAll}
                  ariaLabel="Select all clients"
                />
              </th>
              {visibleCols.map((c) => (
                <th key={c.key} className={`${CELL} font-bold`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, idx) => {
              const g = GROUPS.find((x) => x.key === groupBy);
              const key = g && groupBy !== "none" ? g.get(r) : null;
              const prevKey = key !== null && idx > 0 ? g!.get(pageRows[idx - 1]!) : null;
              const startsGroup = key !== null && (idx === 0 || key !== prevKey);
              return (
                <React.Fragment key={r.id}>
                  {startsGroup ? (
                    <tr className="border-t border-hairline bg-[rgba(15,23,42,0.035)]">
                      <td colSpan={visibleCols.length + 1} className="px-4 py-2 text-[12px] font-black text-ink-strong">
                        {g!.label}: {key}
                        <span className="ml-2 rounded-pill bg-white px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                          {groupCounts.get(key!) ?? 0}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    className="border-t border-hairline align-middle transition-colors"
                    style={
                      sel.selected.has(r.id)
                        ? { background: "rgba(225,6,0,0.06)" }
                        : justAdded?.id === r.id
                          ? { background: "rgba(16,185,129,0.10)" }
                          : undefined
                    }
                  >
                    <td className="py-2.5 pl-4 pr-1 align-middle">
                      <Checkbox
                        checked={sel.selected.has(r.id)}
                        onChange={(on) => sel.toggle(r.id, on)}
                        ariaLabel={`Select ${r.name}`}
                      />
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.key} className={`${CELL} ${c.cellClass ?? ""}`} style={c.cellStyle}>
                        {/* ONE LINE PER ROW. The cell caps its own width and
                            clips rather than wrapping, so a long client note
                            cannot make its row five lines tall and knock every
                            other column out of line. The full value stays on
                            the title attribute, and the company name opens the
                            record where nothing is abbreviated. */}
                        <span className="block max-w-[240px] truncate" title={c.text(r) || undefined}>
                          {c.render ? c.render(r) : c.text(r) || "–"}
                        </span>
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={26} className="mx-auto text-ink-muted" />
            <p className="mt-2 text-[14px] font-bold text-ink-strong">
              {rows.length === 0 ? "No clients yet" : "Nothing matches those filters"}
            </p>
            <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-ink-muted">
              {rows.length === 0
                ? "Onboard one from New Customer KYC and it will appear here — and be billable straight away."
                : "Clear a filter or two and they will come back."}
            </p>
          </div>
        ) : null}
      </div>

      <QuickView customer={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function QuickView({ customer: c, onClose }: { customer: CustomerDetail | null; onClose: () => void }) {
  return (
    <Dialog.Root open={Boolean(c)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.35)] backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[640px] flex-col bg-[var(--color-surface-page,#f8fafc)] shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          {c ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-hairline bg-white px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                    Quick View · <span className="font-mono">{c.clientCode ?? "—"}</span>
                  </p>
                  <Dialog.Title className="mt-0.5 truncate text-[20px] font-black text-ink-strong">
                    {c.name}
                  </Dialog.Title>
                  <StatusLine c={c} />
                </div>
                <Dialog.Close
                  aria-label="Close"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-chip text-ink-muted hover:text-ink-strong"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                >
                  <X size={16} />
                </Dialog.Close>
              </div>
              <div className="slim-scroll flex-1 overflow-y-auto p-4">
                <CustomerDetailBody c={c} compact />
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-hairline bg-white px-5 py-3">
                <button
                  type="button"
                  onClick={() => openKycPrintView(customerToPrintData(c))}
                  className={barBtn}
                >
                  <FileDown size={14} /> View form (PDF)
                </button>
                <Link href={`/billing/customers/${c.id}` as Route} className={barBtn}>
                  <FileText size={14} /> Full Record
                </Link>
                <Link
                  href={`/billing/customers/${c.id}/edit` as Route}
                  className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
                >
                  <Pencil size={14} /> Edit
                </Link>
              </div>
            </>
          ) : (
            <Loader2 className="m-auto animate-spin" />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Tile({
  n,
  label,
  active,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-[18px] p-4 text-left transition hover:-translate-y-px"
      style={active ? { ...CARD_STYLE, boxShadow: `inset 0 0 0 1.5px ${BILLING_PURPLE}` } : CARD_STYLE}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</div>
      <div className="mt-1 text-[26px] font-black text-ink-strong">{n}</div>
    </button>
  );
}

/* ─────────────────────────── columns & groups ──────────────────────────── */

type ColKey =
  | "company" | "code" | "sales" | "industry" | "ptype" | "bizcat" | "nature" | "tags"
  | "gstin" | "pan" | "msme" | "gsttype" | "currency"
  | "contact" | "dept" | "phone" | "whatsapp" | "email"
  | "terms" | "creditdays" | "otherrefs" | "notes"
  | "linkedin" | "instagram" | "subscription" | "emi" | "modulewise"
  | "introWebsite" | "introName" | "introSocial" | "introCity" | "introEmail" | "introWhatsapp"
  | "introCompany" | "introDesignation" | "introNature" | "introCategory" | "introCameThrough" | "introBy"
  | "status" | "created";

type Col = {
  key: ColKey;
  label: string;
  /** Plain text — the Excel export, and the cell unless `render` is given. */
  text: (r: CustomerMasterRow) => string;
  render?: (r: CustomerMasterRow) => React.ReactNode;
  cellClass?: string;
  cellStyle?: React.CSSProperties;
};

/**
 * EVERY CELL, HEADER AND BODY: left-aligned, vertically centred, one line.
 * Columns only add to this — they never replace the alignment, which is what
 * left the old rows ragged (a wrapping company name made its row five lines
 * tall while `align-top` pinned every neighbour to the ceiling).
 */
const CELL = "px-3 py-2.5 text-left align-middle whitespace-nowrap";

const list = (v: string[]) => v.join(", ");
const t = (v: string | null | undefined) => v ?? "";

/**
 * The master's columns, in the order of the New Customer KYC form. Address
 * fields are NOT here — they are the Customer Address Book's.
 */
const COLUMNS: Col[] = [
  {
    key: "company",
    label: "Company",
    text: (r) => r.name,
    cellClass: "px-3 py-3 font-bold text-ink-strong",
    render: (r) => (
      <Link href={`/billing/customers/${r.id}` as Route} className="underline-offset-4 hover:underline">
        {r.name}
      </Link>
    ),
  },
  {
    key: "code",
    label: "Client Code",
    text: (r) => t(r.clientCode),
    cellClass: "whitespace-nowrap px-3 py-3 font-mono text-[12px]",
    cellStyle: { color: BILLING_PURPLE },
  },
  { key: "sales", label: "Sales Person", text: (r) => t(r.salesPersonName) },
  { key: "industry", label: "Industry Type", text: (r) => list(r.industryTypes) },
  { key: "ptype", label: "Product Type", text: (r) => list(r.productTypes) },
  { key: "bizcat", label: "Business Category", text: (r) => t(r.businessCategory) },
  { key: "nature", label: "Nature Of Business", text: (r) => t(r.natureOfBusiness) },
  {
    key: "tags",
    label: "Tags",
    text: (r) => list(r.tags),
    render: (r) =>
      r.tags.length === 0 ? (
        "–"
      ) : (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {r.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-[rgba(225,6,0,0.12)] px-2 py-0.5 text-[11px] font-bold"
              style={{ color: BILLING_PURPLE_DEEP }}
            >
              {tag}
            </span>
          ))}
        </span>
      ),
  },
  { key: "gstin", label: "GSTIN", text: (r) => t(r.gstin), cellClass: "whitespace-nowrap px-3 py-3 font-mono text-[12px]" },
  { key: "pan", label: "PAN", text: (r) => t(r.pan), cellClass: "whitespace-nowrap px-3 py-3 font-mono text-[12px]" },
  { key: "msme", label: "MSME / Udyam No", text: (r) => t(r.msmeNo) },
  { key: "gsttype", label: "GST Registration Type", text: (r) => t(r.gstRegType) },
  { key: "currency", label: "Currency", text: (r) => r.currency },
  {
    key: "contact",
    label: "Contact Person",
    text: (r) => [r.contactName, r.contactDesignation].filter(Boolean).join(" — "),
    render: (r) => (
      <>
        {r.contactName ?? "–"}
        {r.contactDesignation ? (
          <span className="text-[11.5px] text-ink-muted"> — {r.contactDesignation}</span>
        ) : null}
      </>
    ),
  },
  { key: "dept", label: "Department", text: (r) => t(r.contactDepartment) },
  { key: "phone", label: "Contact No", text: (r) => t(r.contactPhone), cellClass: "whitespace-nowrap px-3 py-3" },
  { key: "whatsapp", label: "WhatsApp No", text: (r) => t(r.contactWhatsapp), cellClass: "whitespace-nowrap px-3 py-3" },
  { key: "email", label: "Email", text: (r) => t(r.contactEmail) },
  { key: "terms", label: "Payment Terms", text: (r) => t(r.paymentTerms) },
  { key: "creditdays", label: "Credit Days", text: (r) => t(r.creditDays) },
  { key: "otherrefs", label: "Other References", text: (r) => t(r.otherReferences) },
  { key: "notes", label: "Client Notes", text: (r) => t(r.notes) },
  {
    key: "linkedin",
    label: "LinkedIn Address",
    text: (r) => t(r.linkedinUrl),
    render: (r) =>
      r.linkedinUrl ? (
        <a
          href={/^https?:\/\//i.test(r.linkedinUrl) ? r.linkedinUrl : `https://${r.linkedinUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline-offset-4 hover:underline"
          style={{ color: BILLING_PURPLE_DEEP }}
        >
          View
        </a>
      ) : (
        "–"
      ),
  },
  {
    key: "instagram",
    label: "Instagram Handle",
    text: (r) => t(r.instagramHandle),
    render: (r) =>
      r.instagramHandle ? (
        <a
          href={
            /^https?:\/\//i.test(r.instagramHandle)
              ? r.instagramHandle
              : `https://www.instagram.com/${encodeURIComponent(r.instagramHandle.replace(/^@+/, ""))}/`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline-offset-4 hover:underline"
          style={{ color: BILLING_PURPLE_DEEP }}
        >
          {r.instagramHandle}
        </a>
      ) : (
        "–"
      ),
  },
  { key: "subscription", label: "Subscription", text: (r) => t(r.subscription) },
  { key: "emi", label: "EMI", text: (r) => t(r.emi) },
  { key: "modulewise", label: "Module Wise Payment", text: (r) => t(r.moduleWisePayment) },
  // ── Introducer (KYC "Introducer" box) ──
  { key: "introWebsite", label: "Website", text: (r) => t(r.introducer?.website) },
  {
    key: "introName",
    label: "Introducer Name",
    text: (r) => [r.introducer?.firstName, r.introducer?.lastName].filter(Boolean).join(" "),
  },
  { key: "introSocial", label: "Social Media", text: (r) => t(r.introducer?.socialMedia) },
  { key: "introCity", label: "Introducer City", text: (r) => t(r.introducer?.city) },
  { key: "introEmail", label: "Introducer Email", text: (r) => t(r.introducer?.email) },
  { key: "introWhatsapp", label: "Introducer WhatsApp", text: (r) => t(r.introducer?.whatsapp) },
  { key: "introCompany", label: "Introducer Company", text: (r) => t(r.introducer?.company) },
  { key: "introDesignation", label: "Introducer Designation", text: (r) => t(r.introducer?.designation) },
  { key: "introNature", label: "Introducer Nature Of Work", text: (r) => t(r.introducer?.natureOfWork) },
  { key: "introCategory", label: "Introducer Business Category", text: (r) => t(r.introducer?.businessCategory) },
  { key: "introCameThrough", label: "Came To Know Through", text: (r) => t(r.introducer?.cameThrough) },
  { key: "introBy", label: "Introduced By", text: (r) => t(r.introducer?.introducedBy) },
  {
    key: "status",
    label: "Status",
    text: (r) => (r.isActive ? "Active" : "Inactive"),
    render: (r) => (
      <span style={{ color: r.isActive ? "#15803D" : "var(--color-ink-muted)" }} className="font-bold">
        {r.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
  {
    key: "created",
    label: "Created",
    text: (r) => r.createdAt.toISOString().slice(0, 10),
    cellClass: "whitespace-nowrap px-3 py-3 text-ink-muted",
  },
];

type GroupKey = "none" | "sales" | "industry" | "bizcat" | "status";

const GROUPS: { key: GroupKey; label: string; get: (r: CustomerMasterRow) => string }[] = [
  { key: "none", label: "None", get: () => "" },
  { key: "sales", label: "Sales person", get: (r) => r.salesPersonName ?? "Unassigned" },
  { key: "industry", label: "Industry type", get: (r) => r.industryTypes[0] ?? "No industry type" },
  { key: "bizcat", label: "Business category", get: (r) => r.businessCategory ?? "No business category" },
  { key: "status", label: "Status", get: (r) => (r.isActive ? "Active" : "Inactive") },
];

