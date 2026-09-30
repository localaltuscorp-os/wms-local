"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ApprovalKind, ApprovalRow } from "@/lib/compensation/workflow";
import { decideApproval } from "@/app/(admin)/admin/approvals/actions";

const TABS: ApprovalKind[] = ["attendance", "incentive", "reimbursement", "salary"];
const money = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export function ApprovalWorkbench({ rows }: { rows: ApprovalRow[] }) {
  const [kind, setKind] = useState<ApprovalKind>("attendance"); const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected" | "paid">("pending");
  const [open, setOpen] = useState<string | null>(null); const [pending, start] = useTransition();
  const visible = useMemo(() => rows.filter((r) => r.kind === kind && (filter === "all" || r.status === filter)), [rows, kind, filter]);
  function decide(row: ApprovalRow, status: "approved" | "rejected") {
    const initial = row.amount > 0 ? String(row.amount) : "";
    const value = status === "approved" && row.kind !== "attendance" ? window.prompt("Approved amount", initial) : "";
    if (value === null) return;
    const amount = row.kind === "attendance" ? 0 : Number(value || row.amount);
    if (!Number.isFinite(amount) || amount < 0) return;
    start(async () => { const result = await decideApproval({ kind: row.kind, subjectId: row.subjectId, employeeId: row.employeeId, periodMonth: row.periodMonth, amount, status }); if (!result.ok) window.alert(result.error); });
  }
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
      <div className="flex flex-wrap gap-2">{TABS.map((tab) => <button key={tab} onClick={() => setKind(tab)} className={`rounded-lg px-3 py-2 text-sm font-bold capitalize ${kind === tab ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700"}`}>{tab}</button>)}</div>
      <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paid">Paid</option><option value="all">All</option></select>
    </div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Period / item</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{visible.map((row) => <><tr key={row.subjectId} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-900">{row.employeeName}</td><td className="px-4 py-3"><div>{row.label}</div><div className="text-xs text-slate-500">{row.periodMonth ?? "—"}</div></td><td className="px-4 py-3">{row.kind === "attendance" ? "—" : money(row.amount)}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize">{row.status}</span></td><td className="px-4 py-3 text-right">{row.kind === "attendance" && <button onClick={() => setOpen(open === row.subjectId ? null : row.subjectId)} className="mr-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-700">{open === row.subjectId ? <ChevronDown size={15}/> : <ChevronRight size={15}/>} Daily</button>}{row.status !== "paid" && <><button disabled={pending} onClick={() => decide(row, "approved")} className="mr-2 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white">Approve</button><button disabled={pending} onClick={() => decide(row, "rejected")} className="rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700">Reject</button></>}</td></tr>{open === row.subjectId && <tr key={`${row.subjectId}-daily`} className="border-t bg-slate-50"><td colSpan={5} className="px-5 py-3"><div className="flex flex-wrap gap-2">{row.daily.length ? row.daily.map((d) => <span key={d.day} className="rounded border bg-white px-2 py-1 text-xs"><b>{d.day}</b> · {d.code}</span>) : "No daily attendance marks are available."}</div></td></tr>}</>) }{visible.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No {filter} {kind} approvals.</td></tr>}</tbody></table></div>
  </section>;
}
