"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Eye, Pencil, Search } from "lucide-react";
import type { AddressBookRow } from "@/lib/queries/billing-customers";
import { BILLING_PURPLE, CARD_STYLE } from "@/lib/billing/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { ColumnsMenu, GroupByControl, Pager, TableToolbar, useHiddenColumns } from "@/components/billing/table-toolbar";
import { SelectionBar, barBtn, useRowSelection } from "@/components/billing/selection-bar";

type Key = "customer" | "type" | "label" | "address" | "city" | "state" | "pincode" | "country" | "gstin";
type Group = "none" | "customer" | "type" | "city" | "state" | "country";
const CELL = "px-3 py-2.5 text-left align-middle whitespace-nowrap";
const COLS: { key: Key; label: string; text: (r: AddressBookRow) => string }[] = [
  { key: "customer", label: "Customer", text: (r) => `${r.clientCode ?? ""} ${r.customerName}` },
  { key: "type", label: "Type", text: (r) => r.kind }, { key: "label", label: "Label", text: (r) => r.label ?? "" },
  { key: "address", label: "Address", text: (r) => r.lines.join(", ") }, { key: "city", label: "City", text: (r) => r.city ?? "" },
  { key: "state", label: "State", text: (r) => r.stateName ?? "" }, { key: "pincode", label: "Pin code", text: (r) => r.pincode ?? "" },
  { key: "country", label: "Country", text: (r) => r.country }, { key: "gstin", label: "GSTIN", text: (r) => r.gstin ?? "" },
];
const GROUPS: { key: Group; label: string; get: (r: AddressBookRow) => string }[] = [
  { key: "none", label: "None", get: () => "" }, { key: "customer", label: "Customer", get: (r) => r.customerName },
  { key: "type", label: "Type", get: (r) => r.kind }, { key: "city", label: "City", get: (r) => r.city || "No city" },
  { key: "state", label: "State", get: (r) => r.stateName || "No state" }, { key: "country", label: "Country", get: (r) => r.country || "No country" },
];

export function CustomerAddressBookView({ rows }: { rows: AddressBookRow[] }) {
  const [q, setQ] = React.useState(""); const [groupBy, setGroupBy] = React.useState<Group>("none");
  const [pageSize, setPageSize] = React.useState(20); const [pageIndex, setPageIndex] = React.useState(0); const { hidden, toggle } = useHiddenColumns<Key>();
  const visible = COLS.filter((c) => !hidden.has(c.key));
  const filtered = rows.filter((r) => {
    const search = q.trim().toLowerCase();
    if (search && !COLS.some((c) => c.text(r).toLowerCase().includes(search))) return false;
    return true;
  });
  const group = GROUPS.find((g) => g.key === groupBy)!;
  const ordered = React.useMemo(() => groupBy === "none" ? filtered : [...filtered].sort((a, b) => group.get(a).localeCompare(group.get(b))), [filtered, group, groupBy]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize)); const safePage = Math.min(pageIndex, pageCount - 1); const pageRows = ordered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const sel = useRowSelection(pageRows.map((r) => r.id)); const one = pageRows.find((r) => sel.selected.has(r.id));
  return <div className="customer-address-book-view">
    <TableToolbar left={<><GroupByControl noun="addresses" options={GROUPS} value={groupBy} onChange={(v) => { setGroupBy(v); setPageIndex(0); }} /><CollapsibleSearch scope="addresses"><div className="relative w-[220px] shrink-0"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" /><input value={q} onChange={(e) => { setQ(e.target.value); setPageIndex(0); }} placeholder="Search customer or address…" className="h-8 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-3 text-[12.5px] outline-none" /></div></CollapsibleSearch></>} right={<><Pager pageIndex={safePage} pageCount={pageCount} pageSize={pageSize} rangeStart={ordered.length ? safePage * pageSize + 1 : 0} rangeEnd={Math.min(ordered.length, safePage * pageSize + pageRows.length)} total={ordered.length} noun="addresses" onPage={setPageIndex} onPageSize={(n) => { setPageSize(n); setPageIndex(0); }} /><ColumnsMenu columns={COLS} hidden={hidden} onToggle={toggle} locked="customer" /></>} />
    <div className="mt-4"><SelectionBar count={sel.selected.size} onClear={sel.clear}><Link href={(one ? `/billing/customers/${one.customerId}` : "#") as Route} className={barBtn + (one ? "" : " pointer-events-none opacity-50")}><Eye size={14} /> Open customer</Link><Link href={(one ? `/billing/customers/${one.customerId}/edit` : "#") as Route} className={barBtn + (one ? "" : " pointer-events-none opacity-50")}><Pencil size={14} /> Edit KYC</Link></SelectionBar></div>
    <div className="mt-4 overflow-x-auto rounded-[22px]" style={CARD_STYLE}><table className="w-full border-collapse text-[13px]" style={{ minWidth: 120 + visible.length * 120 }}><thead><tr className="bg-[#EEF1F5] text-[10.5px] uppercase tracking-[0.1em] text-ink-muted"><th className="sticky left-0 z-30 w-14 py-2.5 pl-4 pr-1 text-left" style={{ background: "var(--table-head-bg, var(--color-surface-card))" }}><Checkbox checked={sel.allOn} indeterminate={sel.someOn} onChange={sel.toggleAll} ariaLabel="Select all addresses" /></th>{visible.map((c) => <th key={c.key} className={`${CELL} font-bold`}>{c.label}</th>)}</tr></thead><tbody>{pageRows.map((r, i) => <React.Fragment key={r.id}>{groupBy !== "none" && (i === 0 || group.get(pageRows[i - 1]!) !== group.get(r)) ? <tr className="border-t border-hairline bg-surface-soft"><td colSpan={visible.length + 1} className="px-4 py-2 text-[12px] font-black">{group.label}: {group.get(r)}</td></tr> : null}<tr className="border-t border-hairline" style={sel.selected.has(r.id) ? { background: "rgba(225,6,0,0.06)" } : undefined}><td className="sticky left-0 z-10 py-2.5 pl-4 pr-1" style={{ background: sel.selected.has(r.id) ? "rgba(225,6,0,0.06)" : "var(--color-surface-card)" }}><Checkbox checked={sel.selected.has(r.id)} onChange={(on) => sel.toggle(r.id, on)} ariaLabel={`Select ${r.customerName} address`} /></td>{visible.map((c) => <AddressCell key={c.key} col={c.key} row={r} />)}</tr></React.Fragment>)}</tbody></table></div>
  </div>;
}

function AddressCell({ col, row }: { col: Key; row: AddressBookRow }) { const text = COLS.find((c) => c.key === col)!.text(row) || "—"; if (col === "customer") return <td className={`${CELL} font-semibold`}><Link href={`/billing/customers/${row.customerId}` as Route} className="hover:underline">{row.customerName}</Link><span className="ml-2 font-mono text-[12px]" style={{ color: BILLING_PURPLE }}>{row.clientCode ?? "—"}</span></td>; if (col === "type") return <td className={CELL}><span className="rounded-pill px-2 py-0.5 text-[10px] font-black uppercase" style={row.kind === "shipping" ? { background: "#DBEAFE", color: "#1E3A8A" } : { background: "#FEE2E2", color: "#991B1B" }}>{row.kind}</span></td>; return <td className={`${CELL} ${col === "address" ? "max-w-[340px] truncate" : ""}`} title={text}>{text}</td>; }
