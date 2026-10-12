"use client";

import { Fragment, type DragEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ExternalLink, Loader2, X } from "lucide-react";
import { decideOnboardingApproval } from "@/app/(admin)/admin/approvals/actions";
import { SortableTableHeader, type TableSort } from "@/components/admin/approvals/sortable-table-header";
import type { OnboardingApprovalRow } from "@/lib/hr/onboarding/approval-list";

const ONBOARDING_COLUMNS = ["serial", "who", "purpose", "submitted", "notes", "app", "decisionNotes"] as const;
type OnboardingColumn = (typeof ONBOARDING_COLUMNS)[number];
type DecisionState = { row: OnboardingApprovalRow; status: "approved" | "rejected" };

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function compareText(left: string, right: string) {
  return new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare(left, right);
}

export function OnboardingApprovalsTab({ rows, canDecide, workflowReady }: { rows: OnboardingApprovalRow[]; canDecide: boolean; workflowReady: boolean }) {
  const router = useRouter();
  const [columnOrder, setColumnOrder] = useState<OnboardingColumn[]>([...ONBOARDING_COLUMNS]);
  const [sort, setSort] = useState<TableSort<OnboardingColumn>>(null);
  const [draggedColumn, setDraggedColumn] = useState<OnboardingColumn | null>(null);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visibleRows = useMemo(() => {
    if (!sort || sort.key === "serial") return rows;
    const valueFor = (row: OnboardingApprovalRow) => {
      switch (sort.key) {
        case "who": return row.employeeName;
        case "purpose": return "Employee onboarding form";
        case "submitted": return row.submittedAt;
        case "notes": return row.summary;
        case "app": return row.status;
        case "decisionNotes": return row.decisionNote ?? "";
      }
    };
    return rows.slice().sort((left, right) => {
      const comparison = compareText(String(valueFor(left)), String(valueFor(right)));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [rows, sort]);

  function toggleSort(column: OnboardingColumn) {
    if (column === "serial") return;
    setSort((current) => current?.key === column ? { key: column, direction: current.direction === "asc" ? "desc" : "asc" } : { key: column, direction: column === "submitted" ? "desc" : "asc" });
  }

  function startColumnDrag(event: DragEvent<HTMLTableCellElement>, column: OnboardingColumn) {
    if (column === "serial") return;
    setDraggedColumn(column);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column);
  }

  function dropColumn(event: DragEvent<HTMLTableCellElement>, target: OnboardingColumn) {
    event.preventDefault();
    const source = (draggedColumn ?? event.dataTransfer.getData("text/plain")) as OnboardingColumn;
    if (!source || source === "serial" || target === "serial" || source === target || !ONBOARDING_COLUMNS.includes(source)) {
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

  function openDecision(row: OnboardingApprovalRow, status: "approved" | "rejected") {
    setDecision({ row, status });
    setNote(row.decisionNote ?? "");
    setError(null);
  }

  function submitDecision() {
    if (!decision) return;
    const decisionNote = note.trim();
    if (decision.status === "rejected" && !decisionNote) {
      setError("A reason is required when rejecting an onboarding form.");
      return;
    }
    startTransition(async () => {
      const result = await decideOnboardingApproval({ submissionId: decision.row.id, employeeId: decision.row.employeeId, status: decision.status, note: decisionNote || undefined });
      if (!result.ok) { setError(result.error); return; }
      setDecision(null);
      router.refresh();
    });
  }

  function renderCell(row: OnboardingApprovalRow, index: number, column: OnboardingColumn) {
    switch (column) {
      case "serial": return <td className="w-16 whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-500">{index + 1}</td>;
      case "who": return <td className="max-w-56 whitespace-nowrap px-4 py-3 font-semibold text-slate-900"><span className="block truncate" title={row.employeeName}>{row.employeeName}</span></td>;
      case "purpose": return <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">Employee onboarding form</td>;
      case "submitted": return <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{displayDate(row.submittedAt)}</td>;
      case "notes": return <td className="max-w-64 whitespace-nowrap px-4 py-3 text-slate-600"><span className="inline-block max-w-52 truncate align-middle" title={row.summary}>{row.summary}</span><Link href={`/dossier/onboarding?emp=${row.employeeId}` as Route} aria-label={`View ${row.employeeName}'s onboarding form`} title="View onboarding form" className="ml-2 inline-flex align-middle text-slate-500 hover:text-red-700"><ExternalLink size={15} aria-hidden /></Link></td>;
      case "app": return <td className="whitespace-nowrap px-4 py-3">{row.status === "pending" ? workflowReady && canDecide ? <><button type="button" disabled={pending} onClick={() => openDecision(row, "approved")} className="mr-2 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">Yes</button><button type="button" disabled={pending} onClick={() => openDecision(row, "rejected")} className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50">No</button></> : <span className="text-xs font-semibold text-slate-500">Pending</span> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "approved" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"}`}>{row.status === "approved" ? "Yes" : "No"}</span>}</td>;
      case "decisionNotes": return <td className="max-w-64 whitespace-nowrap px-4 py-3 text-slate-600"><span className="block truncate" title={row.decisionNote ?? undefined}>{row.decisionNote || "-"}</span></td>;
    }
  }

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    {!workflowReady && <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">Setup required: onboarding approval actions are unavailable until the approval workflow migration is installed.</div>}
    <div className="no-scrollbar overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50/70 text-xs font-bold uppercase tracking-wide text-slate-600"><tr>{columnOrder.map((column) => <SortableTableHeader key={column} column={column} label={{ serial: "S. No.", who: "Who", purpose: "Purpose", submitted: "Submitted on", notes: "Notes", app: "App", decisionNotes: "Decision notes" }[column]} pinned={column === "serial"} sortable={column !== "serial"} sort={sort} dragging={draggedColumn === column} onSort={toggleSort} onDragStart={startColumnDrag} onDragEnd={() => setDraggedColumn(null)} onDrop={dropColumn} />)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id} className="h-14 border-t border-slate-100 text-slate-700 hover:bg-slate-50/60">{columnOrder.map((column) => <Fragment key={column}>{renderCell(row, index, column)}</Fragment>)}</tr>)}</tbody></table></div>
    {rows.length === 0 && <p className="border-t border-slate-100 px-4 py-5 text-center text-sm text-slate-500">No submitted onboarding forms are waiting for approval.</p>}
    {decision && <OnboardingDecisionDialog decision={decision} note={note} error={error} pending={pending} onNoteChange={setNote} onClose={() => !pending && setDecision(null)} onSubmit={submitDecision} />}
  </div>;
}

function OnboardingDecisionDialog({ decision, note, error, pending, onNoteChange, onClose, onSubmit }: { decision: DecisionState; note: string; error: string | null; pending: boolean; onNoteChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const rejecting = decision.status === "rejected";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-4" role="presentation" onMouseDown={onClose}><form role="dialog" aria-modal="true" aria-labelledby="onboarding-decision-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><div className="flex items-start justify-between gap-4"><div><h2 id="onboarding-decision-title" className="text-lg font-bold text-slate-900">{rejecting ? "Reject" : "Approve"} onboarding form</h2><p className="mt-1 text-sm text-slate-600">{decision.row.employeeName} · Submitted {displayDate(decision.row.submittedAt)}</p></div><button type="button" onClick={onClose} disabled={pending} aria-label="Close decision form" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"><X size={18} aria-hidden /></button></div><div className="mt-5"><label className="block text-sm font-bold text-slate-800">{rejecting ? "Reason for rejection" : "Decision note (optional)"}<textarea value={note} onChange={(event) => onNoteChange(event.target.value)} disabled={pending} autoFocus rows={4} maxLength={800} className="mt-1.5 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50" /></label>{error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="submit" disabled={pending} className={`inline-flex min-w-24 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${rejecting ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{pending ? <Loader2 size={16} className="animate-spin" aria-label="Saving" /> : rejecting ? "Reject" : "Approve"}</button></div></form></div>;
}
