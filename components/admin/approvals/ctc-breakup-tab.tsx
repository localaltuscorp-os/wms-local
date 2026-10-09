"use client";

import { Fragment, type DragEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, X } from "lucide-react";
import { decideApproval } from "@/app/(admin)/admin/approvals/actions";
import { SortableTableHeader, type TableSort } from "@/components/admin/approvals/sortable-table-header";
import type { CtcApprovalRow } from "@/lib/hr/ctc/approval-list";

const money = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const groups = ["earning", "deduction", "employer"] as const;
const groupLabels = { earning: "Earnings", deduction: "Deductions", employer: "Employer contributions" } as const;
const CTC_COLUMNS = ["serial", "who", "purpose", "amount", "notes", "app", "decisionNotes"] as const;
type CtcColumn = (typeof CTC_COLUMNS)[number];
type DecisionState = { row: CtcApprovalRow; status: "approved" | "rejected" };

function displayDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function compareText(left: string, right: string) {
  return new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare(left, right);
}

export function CtcBreakupTab({ rows, canDecide, workflowReady }: { rows: CtcApprovalRow[]; canDecide: boolean; workflowReady: boolean }) {
  const router = useRouter();
  const [columnOrder, setColumnOrder] = useState<CtcColumn[]>([...CTC_COLUMNS]);
  const [sort, setSort] = useState<TableSort<CtcColumn>>(null);
  const [draggedColumn, setDraggedColumn] = useState<CtcColumn | null>(null);
  const [viewRow, setViewRow] = useState<CtcApprovalRow | null>(null);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visibleRows = useMemo(() => {
    if (!sort || sort.key === "serial") return rows;
    const valueFor = (row: CtcApprovalRow) => {
      switch (sort.key) {
        case "who": return row.employeeName;
        case "purpose": return `${row.reason} V${row.version}`;
        case "amount": return row.ctcAnnual;
        case "notes": return row.effectiveDate ?? "";
        case "app": return row.status;
        case "decisionNotes": return row.decisionNote ?? "";
      }
    };
    return rows.slice().sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : compareText(String(leftValue), String(rightValue));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [rows, sort]);

  function toggleSort(column: CtcColumn) {
    if (column === "serial") return;
    setSort((current) => current?.key === column ? { key: column, direction: current.direction === "asc" ? "desc" : "asc" } : { key: column, direction: column === "amount" ? "desc" : "asc" });
  }

  function startColumnDrag(event: DragEvent<HTMLTableCellElement>, column: CtcColumn) {
    if (column === "serial") return;
    setDraggedColumn(column);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column);
  }

  function dropColumn(event: DragEvent<HTMLTableCellElement>, target: CtcColumn) {
    event.preventDefault();
    const source = (draggedColumn ?? event.dataTransfer.getData("text/plain")) as CtcColumn;
    if (!source || source === "serial" || target === "serial" || source === target || !CTC_COLUMNS.includes(source)) {
      setDraggedColumn(null);
      return;
    }
    setColumnOrder((current) => {
      const from = current.indexOf(source);
      const to = current.indexOf(target);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, source);
      return next;
    });
    setDraggedColumn(null);
  }

  function openDecision(row: CtcApprovalRow, status: "approved" | "rejected") {
    setDecision({ row, status });
    setNote(row.decisionNote ?? "");
    setError(null);
  }

  function submitDecision() {
    if (!decision) return;
    const decisionNote = note.trim();
    if (decision.status === "rejected" && !decisionNote) {
      setError("A reason is required when rejecting a CTC breakup.");
      return;
    }
    startTransition(async () => {
      const result = await decideApproval({ kind: "ctc", subjectId: decision.row.id, employeeId: decision.row.employeeId, periodMonth: decision.row.effectiveDate ? decision.row.effectiveDate.slice(0, 7) : null, amount: decision.row.ctcAnnual, status: decision.status, note: decisionNote || undefined });
      if (!result.ok) { setError(result.error); return; }
      setDecision(null);
      router.refresh();
    });
  }

  function renderCell(row: CtcApprovalRow, index: number, column: CtcColumn) {
    switch (column) {
      case "serial": return <td className="w-16 whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-500">{index + 1}</td>;
      case "who": return <td className="max-w-56 whitespace-nowrap px-4 py-3 font-semibold text-slate-900"><span className="block truncate" title={row.employeeName}>{row.employeeName}</span></td>;
      case "purpose": return <td className="max-w-64 whitespace-nowrap px-4 py-3"><span className="font-medium text-slate-800">{row.reason}</span><span className="ml-2 text-xs text-slate-500">V{row.version}</span></td>;
      case "amount": return <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-slate-900">{money(row.ctcAnnual)}</td>;
      case "notes": return <td className="whitespace-nowrap px-4 py-3 text-slate-600"><span>Effective {displayDate(row.effectiveDate)}</span><button type="button" onClick={() => setViewRow(row)} title={`View ${row.employeeName}'s CTC breakup`} aria-label={`View ${row.employeeName}'s CTC breakup`} className="ml-2 inline-flex align-middle text-slate-500 hover:text-red-700"><Eye size={15} aria-hidden /></button></td>;
      case "app": return <td className="whitespace-nowrap px-4 py-3">{row.status === "pending" ? workflowReady && canDecide ? <><button type="button" disabled={pending} onClick={() => openDecision(row, "approved")} className="mr-2 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">Yes</button><button type="button" disabled={pending} onClick={() => openDecision(row, "rejected")} className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50">No</button></> : <span className="text-xs font-semibold text-slate-500">Pending</span> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "approved" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"}`}>{row.status === "approved" ? "Yes" : "No"}</span>}</td>;
      case "decisionNotes": return <td className="max-w-64 whitespace-nowrap px-4 py-3 text-slate-600"><span className="block truncate" title={row.decisionNote ?? undefined}>{row.decisionNote || "-"}</span></td>;
    }
  }

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    {!workflowReady && <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">Setup required: CTC approval actions are unavailable until the approval workflow migration is installed.</div>}
    <div className="no-scrollbar overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50/70 text-xs font-bold uppercase tracking-wide text-slate-600"><tr>{columnOrder.map((column) => <SortableTableHeader key={column} column={column} label={{ serial: "S. No.", who: "Who", purpose: "Purpose", amount: "Amount", notes: "Notes", app: "App", decisionNotes: "Decision notes" }[column]} align={column === "amount" ? "right" : "left"} pinned={column === "serial"} sortable={column !== "serial"} sort={sort} dragging={draggedColumn === column} onSort={toggleSort} onDragStart={startColumnDrag} onDragEnd={() => setDraggedColumn(null)} onDrop={dropColumn} />)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id} className="h-14 border-t border-slate-100 text-slate-700 hover:bg-slate-50/60">{columnOrder.map((column) => <Fragment key={column}>{renderCell(row, index, column)}</Fragment>)}</tr>)}</tbody></table></div>
    {rows.length === 0 && <p className="border-t border-slate-100 px-4 py-5 text-center text-sm text-slate-500">No CTC breakup records are available yet.</p>}
    {viewRow && <CtcBreakupDialog row={viewRow} onClose={() => setViewRow(null)} />}
    {decision && <CtcDecisionDialog decision={decision} note={note} error={error} pending={pending} onNoteChange={setNote} onClose={() => !pending && setDecision(null)} onSubmit={submitDecision} />}
  </div>;
}

function CtcBreakupDialog({ row, onClose }: { row: CtcApprovalRow; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-4" role="presentation" onMouseDown={onClose}><div role="dialog" aria-modal="true" aria-labelledby="ctc-breakup-title" className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="ctc-breakup-title" className="text-lg font-bold text-slate-900">{row.employeeName}&apos;s CTC breakup</h2><p className="mt-1 text-sm text-slate-600">{row.reason} · Version {row.version} · Effective {displayDate(row.effectiveDate)}</p></div><button type="button" onClick={onClose} aria-label="Close CTC breakup" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={18} aria-hidden /></button></div>{row.components.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No CTC components have been entered for this version.</p> : <div className="grid gap-3 lg:grid-cols-3">{groups.map((group) => { const components = row.components.filter((component) => component.group === group); if (!components.length) return null; return <section key={group} className="overflow-hidden rounded-lg border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">{groupLabels[group]}</h3><div className="divide-y divide-slate-100">{components.map((component) => <div key={component.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><span className="text-slate-600">{component.label}</span><span className="shrink-0 text-right font-semibold tabular-nums text-slate-900"><span className="block">{money(component.monthly)} / mo</span><span className="block text-[10px] font-medium text-slate-500">{money(component.annual)} / yr</span></span></div>)}</div></section>; })}</div>}</div></div>;
}

function CtcDecisionDialog({ decision, note, error, pending, onNoteChange, onClose, onSubmit }: { decision: DecisionState; note: string; error: string | null; pending: boolean; onNoteChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const rejecting = decision.status === "rejected";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-4" role="presentation" onMouseDown={onClose}><form role="dialog" aria-modal="true" aria-labelledby="ctc-decision-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><div className="flex items-start justify-between gap-4"><div><h2 id="ctc-decision-title" className="text-lg font-bold text-slate-900">{rejecting ? "Reject" : "Approve"} CTC breakup</h2><p className="mt-1 text-sm text-slate-600">{decision.row.employeeName} · {money(decision.row.ctcAnnual)} annual CTC</p></div><button type="button" onClick={onClose} disabled={pending} aria-label="Close decision form" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"><X size={18} aria-hidden /></button></div><div className="mt-5"><label className="block text-sm font-bold text-slate-800">{rejecting ? "Reason for rejection" : "Decision note (optional)"}<textarea value={note} onChange={(event) => onNoteChange(event.target.value)} disabled={pending} autoFocus rows={4} maxLength={800} className="mt-1.5 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50" /></label>{error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="submit" disabled={pending} className={`inline-flex min-w-24 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${rejecting ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{pending ? <Loader2 size={16} className="animate-spin" aria-label="Saving" /> : rejecting ? "Reject" : "Approve"}</button></div></form></div>;
}
