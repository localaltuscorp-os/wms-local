"use client";

import { Fragment, type DragEvent as ReactDragEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronDown, ChevronRight, ClipboardList, ExternalLink, GripVertical, Loader2, Paperclip, Pencil, ShieldCheck, X } from "lucide-react";
import type { ApprovalKind, ApprovalRow, ApprovalStatus, AttendancePerformanceDay } from "@/lib/compensation/workflow";
import { decideApproval } from "@/app/(admin)/admin/approvals/actions";
import { listClaimAttachments, type ClaimAttachmentView } from "@/app/(app)/reimbursements/attachment-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { CtcBreakupTab } from "@/components/admin/approvals/ctc-breakup-tab";
import type { CtcApprovalRow } from "@/lib/hr/ctc/approval-list";
import { OnboardingApprovalsTab } from "@/components/admin/approvals/onboarding-approvals-tab";
import type { OnboardingApprovalRow } from "@/lib/hr/onboarding/approval-list";

type ApprovalTab = ApprovalKind | "ctc" | "onboarding";
const TABS: readonly ApprovalTab[] = ["attendance", "incentive", "reimbursement", "salary", "ctc", "onboarding"];
const STATUSES: readonly ("all" | ApprovalStatus)[] = ["pending", "approved", "rejected", "paid", "all"];

const money = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const labelFor = (kind: ApprovalKind) => kind === "attendance" ? "Attendance" : kind.charAt(0).toUpperCase() + kind.slice(1);
const statusTone = (status: ApprovalStatus) => ({
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-800 ring-rose-200",
  paid: "bg-sky-50 text-sky-800 ring-sky-200",
}[status]);

const attendanceStatusLabel: Record<string, string> = {
  P: "Full day", A: "Absent", "W/O": "Weekly off", H: "Holiday", PL: "Paid leave", CO: "Comp off", "H/D": "Half day",
};

const attendanceStatusTone = (code: string) => {
  if (code === "P") return "bg-emerald-50 text-emerald-700";
  if (code === "A") return "bg-rose-50 text-rose-700";
  if (code === "H" || code === "W/O") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
};

function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function displayPeriod(period: string | null): string {
  if (!period) return "-";
  const isoDate = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period.slice(0, 10);
  if (Number.isNaN(Date.parse(`${isoDate}T12:00:00Z`))) return period;
  return displayDate(isoDate).replaceAll(" ", "-");
}

function displayDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function displayTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "-";
}

function displayDuration(minutes: number | null): string {
  if (minutes == null) return "-";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

type AttendanceWeek = { start: string; days: AttendancePerformanceDay[] };
type ApprovalSortKey = "employee" | "request" | "period" | "amount" | "decision" | "note";
type ApprovalSort = { key: ApprovalSortKey; direction: "asc" | "desc" } | null;
type DecisionDialogState = { row: ApprovalRow; status: "approved" | "rejected"; edit: boolean };
type ApprovalColumn = "employee" | "request" | "period" | "amount" | "decision" | "note" | "attachments" | "action" | "details";

const APPROVAL_COLUMN_ORDER: readonly ApprovalColumn[] = [
  "employee", "request", "period", "amount", "decision", "note", "attachments", "action", "details",
];

const textCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const approvalCheckboxClass = (selected: boolean) => selected
  ? "!size-5 !rounded-md !border-red-600 shadow-sm"
  : "!size-5 !rounded-md !border-slate-400 !bg-white shadow-sm hover:!border-red-500";

function workedDaysFor(row: ApprovalRow): number {
  const value = row.label.match(/([0-9.]+) worked days/i)?.[1];
  return value ? Number(value) : 0;
}

function attendanceMonthLabel(row: ApprovalRow): string {
  return row.label.replace(/\s*[·•-]?\s*\d+(?:\.\d+)?\s*worked days\b/i, "").trim();
}

function attendanceWeeks(days: AttendancePerformanceDay[]): AttendanceWeek[] {
  const grouped = new Map<string, AttendancePerformanceDay[]>();
  for (const day of days) {
    const start = mondayOf(day.date);
    grouped.set(start, [...(grouped.get(start) ?? []), day]);
  }
  return [...grouped.entries()]
    .map(([start, weekDays]) => ({ start, days: weekDays.sort((left, right) => left.date.localeCompare(right.date)) }))
    .sort((left, right) => left.start.localeCompare(right.start));
}

function columnsFor(kind: ApprovalKind, order: readonly ApprovalColumn[]): ApprovalColumn[] {
  return order.filter((column) => {
    if (column === "request") return kind !== "attendance";
    if (column === "attachments") return kind === "reimbursement";
    if (column === "details") return kind === "attendance";
    return true;
  });
}

function labelForColumn(column: ApprovalColumn, kind: ApprovalKind): string {
  switch (column) {
    case "employee": return "Employee";
    case "request": return "Request";
    case "period": return "Period";
    case "amount": return kind === "attendance" ? "Worked days" : "Amount";
    case "decision": return "Decision";
    case "note": return "Note";
    case "attachments": return "Attachments";
    case "action": return "Action";
    case "details": return "Attendance details";
  }
}

function sortKeyForColumn(column: ApprovalColumn): ApprovalSortKey | null {
  return column === "employee" || column === "request" || column === "period" || column === "amount" || column === "decision" || column === "note"
    ? column
    : null;
}

export function ApprovalWorkbench({ rows, ctcRows, onboardingRows, canDecide, canDecideIncentive, workflowReady, onboardingWorkflowReady, allowEdit, testingMode, preview = false }: { rows: ApprovalRow[]; ctcRows: CtcApprovalRow[]; onboardingRows: OnboardingApprovalRow[]; canDecide: boolean; canDecideIncentive: boolean; workflowReady: boolean; onboardingWorkflowReady: boolean; allowEdit: boolean; testingMode: boolean; preview?: boolean }) {
  const [kind, setKind] = useState<ApprovalTab>("attendance");
  const approvalKind: ApprovalKind = kind === "ctc" || kind === "onboarding" ? "attendance" : kind;
  // The local test workspace starts on every status so Edit controls are
  // immediately visible for each approval tab. The real queue remains
  // focused on pending items by default.
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>(testingMode ? "all" : "pending");
  const [sort, setSort] = useState<ApprovalSort>(null);
  const [columnOrder, setColumnOrder] = useState<ApprovalColumn[]>(() => [...APPROVAL_COLUMN_ORDER]);
  const [draggedColumn, setDraggedColumn] = useState<ApprovalColumn | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [openAttendanceId, setOpenAttendanceId] = useState<string | null>(null);
  const [openWeekIds, setOpenWeekIds] = useState<string[]>([]);
  const [attachmentRow, setAttachmentRow] = useState<ApprovalRow | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<ClaimAttachmentView[] | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialogState | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionAmount, setDecisionAmount] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState(rows);
  const [pending, start] = useTransition();
  const sourceRows = preview ? previewRows : rows;
  const visible = useMemo(() => {
    const filtered = sourceRows.filter((row) => row.kind === approvalKind && (filter === "all" || row.status === filter));
    if (!sort) return filtered;

    return filtered.slice().sort((left, right) => {
      const valueFor = (row: ApprovalRow) => {
        switch (sort.key) {
          case "employee": return row.employeeName;
          case "request": return row.kind === "attendance" ? attendanceMonthLabel(row) : row.label;
          case "period": return row.periodMonth ?? "";
          case "amount": return row.kind === "attendance" ? workedDaysFor(row) : row.amount;
          case "decision": return row.status;
          case "note": return row.note ?? "";
        }
      };
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : textCollator.compare(String(leftValue), String(rightValue));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [sourceRows, approvalKind, filter, sort]);

  function toggleSort(key: ApprovalSortKey) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "amount" ? "desc" : "asc" });
  }

  function startColumnDrag(event: ReactDragEvent<HTMLTableCellElement>, column: ApprovalColumn) {
    setDraggedColumn(column);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column);
  }

  function dropColumn(event: ReactDragEvent<HTMLTableCellElement>, target: ApprovalColumn) {
    event.preventDefault();
    const source = draggedColumn ?? event.dataTransfer.getData("text/plain") as ApprovalColumn;
    // Employee is the table's pinned reference column. Keep it first so it
    // remains readable while the other columns are rearranged and scrolled.
    if (!source || source === "employee" || target === "employee" || source === target || !APPROVAL_COLUMN_ORDER.includes(source)) {
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

  const selectedVisibleCount = visible.filter((row) => selectedIds.has(row.subjectId)).length;
  const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectedRows = visible.filter((row) => selectedIds.has(row.subjectId));
  const selectedRow = selectedRows.length === 1 ? selectedRows[0]! : null;
  const canUseSelectedDecision = !!selectedRow
    && workflowReady
    && canDecide
    && (selectedRow.kind !== "incentive" || canDecideIncentive)
    && selectedRow.status === "pending";
  const canUseSelectedEdit = !!selectedRow
    && workflowReady
    && allowEdit
    && (selectedRow.status === "approved" || selectedRow.status === "rejected");
  const columns = useMemo(() => columnsFor(approvalKind, columnOrder), [approvalKind, columnOrder]);
  const columnCount = columns.length + 1;

  function toggleRowSelection(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const row of visible) {
        if (selected) next.add(row.subjectId); else next.delete(row.subjectId);
      }
      return next;
    });
  }

  function selectKind(nextKind: ApprovalTab) {
    setKind(nextKind);
    if (nextKind === "attendance" && sort?.key === "request") setSort(null);
  }

  async function openAttachments(row: ApprovalRow) {
    setAttachmentRow(row);
    setAttachmentFiles(null);
    setAttachmentError(null);
    setAttachmentsLoading(true);
    const result = await listClaimAttachments(row.subjectId).catch(() => null);
    if (result === null) setAttachmentError("Could not load the attached documents.");
    else if (!result.ok) setAttachmentError(result.error);
    else setAttachmentFiles(result.files);
    setAttachmentsLoading(false);
  }

  function toggleAttendance(row: ApprovalRow) {
    setOpenAttendanceId((current) => current === row.subjectId ? null : row.subjectId);
    // A reopened attendance month always starts with all weeks minimised.
    setOpenWeekIds((current) => current.filter((value) => !value.startsWith(`${row.subjectId}:`)));
  }

  function toggleWeek(id: string) {
    setOpenWeekIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function openDecisionDialog(row: ApprovalRow, status: "approved" | "rejected", edit = false) {
    setDecisionDialog({ row, status, edit });
    setDecisionNote(row.note ?? "");
    setDecisionAmount(status === "approved" && row.kind !== "attendance" ? String(row.amount) : "");
    setDecisionError(null);
  }

  function closeDecisionDialog() {
    if (!pending) setDecisionDialog(null);
  }

  function submitDecision() {
    if (!decisionDialog) return;
    const { row, status, edit } = decisionDialog;
    const note = decisionNote.trim();
    if (status === "rejected" && !note) {
      setDecisionError("A reason for rejection is required.");
      return;
    }

    const amount = status === "approved" && row.kind !== "attendance" ? Number(decisionAmount) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setDecisionError("Enter a valid approved amount.");
      return;
    }
    if (status === "approved" && row.kind !== "attendance" && amount <= 0) {
      setDecisionError("Enter an approved amount greater than zero.");
      return;
    }

    setDecisionError(null);
    if (preview) {
      setPreviewRows((current) => current.map((candidate) => candidate.subjectId === row.subjectId
        ? { ...candidate, status, note: note || null, amount: candidate.kind === "attendance" ? candidate.amount : amount }
        : candidate));
      setDecisionDialog(null);
      return;
    }
    start(async () => {
      const result = await decideApproval({
        kind: row.kind,
        subjectId: row.subjectId,
        employeeId: row.employeeId,
        periodMonth: row.periodMonth,
        amount,
        status,
        note: note || undefined,
        edit,
      });
      if (!result.ok) {
        setDecisionError(result.error);
        return;
      }
      setDecisionDialog(null);
    });
  }

  function renderCell(row: ApprovalRow, column: ApprovalColumn) {
    switch (column) {
      case "employee":
        return <td className={`sticky left-12 z-20 min-w-[240px] whitespace-nowrap px-4 py-3 font-semibold text-slate-900 shadow-[8px_0_10px_-12px_rgba(15,23,42,0.45)] ${selectedIds.has(row.subjectId) ? "bg-red-50" : "bg-white"}`} title={row.employeeName}>{row.employeeName}</td>;
      case "request":
        return <td className="max-w-64 px-4 py-3 text-slate-700"><span className="block truncate" title={row.label}>{row.label}</span></td>;
      case "period":
        return <td className="px-4 py-3 whitespace-nowrap text-slate-600">{displayPeriod(row.periodMonth)}</td>;
      case "amount":
        return <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-slate-800">{row.kind === "attendance" ? workedDaysFor(row).toFixed(2) : money(row.amount)}</td>;
      case "decision":
        return <td className="px-4 py-3 whitespace-nowrap"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ${statusTone(row.status)}`}>{row.status}</span></td>;
      case "note":
        return <NoteCell note={row.note} />;
      case "attachments":
        return <ReimbursementAttachmentCell row={row} onOpen={() => void openAttachments(row)} />;
      case "action":
        return <td className="whitespace-nowrap px-4 py-3 text-left">
          {workflowReady && canDecide && (row.kind !== "incentive" || canDecideIncentive) && row.status === "pending" && <><button type="button" disabled={pending} onClick={() => openDecisionDialog(row, "approved")} className="mr-2 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">Yes</button><button type="button" disabled={pending} onClick={() => openDecisionDialog(row, "rejected")} className="rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">No</button></>}
          {workflowReady && canDecide && row.kind === "incentive" && !canDecideIncentive && row.status === "pending" && <span className="text-xs font-semibold text-slate-500">Incentive reviewer only</span>}
          {row.status === "paid" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700"><ShieldCheck size={14} /> Paid</span>}
          {row.status !== "pending" && row.status !== "paid" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><ShieldCheck size={14} /> Final</span>}
        </td>;
      case "details":
        return <td className="whitespace-nowrap px-4 py-3 text-right"><button type="button" onClick={() => toggleAttendance(row)} aria-expanded={openAttendanceId === row.subjectId} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-red-200 hover:text-red-700">{openAttendanceId === row.subjectId ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Weeks</button></td>;
    }
  }

  return (
    <Tooltip.Provider delayDuration={150}>
    <section className="space-y-3">
      {preview && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">Preview data is active because the local approvals backend is unavailable. You can approve, reject, and edit these records in this session without changing live data.</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Approval sections">
          {TABS.map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={kind === tab} onClick={() => selectKind(tab)} className={`rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${kind === tab ? "border-red-200 bg-red-50 text-red-700" : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"}`}>
              {tab === "ctc" ? "CTC Breakup" : tab === "onboarding" ? "Onboarding" : labelFor(tab)}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {kind === "ctc" ? <Link href="/hr/ctc" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-transparent px-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"><ClipboardList size={15} strokeWidth={2.4} aria-hidden /> CTC workspace</Link> : kind === "onboarding" ? null : <>
          {kind === "attendance" && (
            <Link
              href="/attendance/dashboard"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-transparent px-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <ClipboardList size={15} strokeWidth={2.4} aria-hidden />
              Att Report
            </Link>
          )}
          <label className="text-sm font-semibold text-slate-700">
            <span className="sr-only">Approval status</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as (typeof STATUSES)[number])} className="h-9 min-w-32 rounded-lg border border-slate-300 bg-transparent px-3 text-sm">
              {STATUSES.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
            </select>
          </label>
          </>}
        </div>
      </div>

      {kind === "ctc" ? <CtcBreakupTab rows={ctcRows} canDecide={canDecide} workflowReady={workflowReady} /> : kind === "onboarding" ? <OnboardingApprovalsTab rows={onboardingRows} canDecide={canDecide} workflowReady={onboardingWorkflowReady} /> : <>
      {selectedVisibleCount > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm shadow-[0_8px_20px_-18px_rgba(15,23,42,0.4)]" aria-live="polite" role="region" aria-label="Actions for selected approvals">
        <span className="mr-1 font-semibold text-slate-700">{selectedVisibleCount} approval{selectedVisibleCount === 1 ? "" : "s"} selected</span>
        <button type="button" disabled={!canUseSelectedEdit || pending} onClick={() => selectedRow && openDecisionDialog(selectedRow, selectedRow.status === "approved" ? "approved" : "rejected", true)} title={canUseSelectedEdit ? "Edit the selected approval" : "Select one approved or rejected unpaid approval to edit"} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"><Pencil size={14} aria-hidden /> Edit</button>
        <span className="inline-flex rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">Actions</span>
        <button type="button" disabled={!canUseSelectedDecision || pending} onClick={() => selectedRow && openDecisionDialog(selectedRow, "approved")} title={canUseSelectedDecision ? "Approve the selected pending approval" : "Select one pending approval to approve"} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">Yes</button>
        <button type="button" disabled={!canUseSelectedDecision || pending} onClick={() => selectedRow && openDecisionDialog(selectedRow, "rejected")} title={canUseSelectedDecision ? "Reject the selected pending approval" : "Select one pending approval to reject"} className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45">No</button>
      </div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {!workflowReady && <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"><ShieldCheck size={16} aria-hidden /> Setup required: approval actions are unavailable until the compensation approval database migration is installed.</div>}
      <div className="no-scrollbar overflow-x-auto">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="bg-slate-50/70 text-xs font-bold uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="sticky left-0 z-40 w-12 bg-slate-50 px-4 py-3 text-left">
                <Checkbox checked={allVisibleSelected} indeterminate={someVisibleSelected} onChange={toggleAllVisible} ariaLabel="Select all visible approvals" className={approvalCheckboxClass(allVisibleSelected || someVisibleSelected)} />
              </th>
              {columns.map((column) => (
                <DraggableApprovalHeader
                  key={column}
                  column={column}
                  kind={approvalKind}
                  sort={sort}
                  dragging={draggedColumn === column}
                  onSort={toggleSort}
                  onDragStart={startColumnDrag}
                  onDragEnd={() => setDraggedColumn(null)}
                  onDrop={dropColumn}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => <Fragment key={row.subjectId}>
              <tr className={`border-t border-slate-100 ${selectedIds.has(row.subjectId) ? "bg-red-50/40" : ""}`}>
                <td className={`sticky left-0 z-30 w-12 px-4 py-3 ${selectedIds.has(row.subjectId) ? "bg-red-50" : "bg-white"}`}><Checkbox checked={selectedIds.has(row.subjectId)} onChange={(selected) => toggleRowSelection(row.subjectId, selected)} ariaLabel={`Select ${row.employeeName} approval`} className={approvalCheckboxClass(selectedIds.has(row.subjectId))} /></td>
                {columns.map((column) => <Fragment key={column}>{renderCell(row, column)}</Fragment>)}
              </tr>
              {row.kind === "attendance" && openAttendanceId === row.subjectId && <tr className="border-t border-slate-100 bg-slate-50/60"><td colSpan={columnCount} className="p-0"><AttendanceWeeksTable row={row} openWeekIds={openWeekIds} onToggleWeek={toggleWeek} /></td></tr>}
            </Fragment>)}
            {visible.length === 0 && <tr><td colSpan={columnCount} className="px-4 py-12 text-center text-slate-500">No {filter === "all" ? "" : `${filter} `}{labelFor(approvalKind).toLowerCase()} items.</td></tr>}
          </tbody>
        </table>
      </div>
      </div>
      </>}
      {attachmentRow && <ReimbursementAttachmentsDialog row={attachmentRow} files={attachmentFiles} error={attachmentError} loading={attachmentsLoading} onClose={() => setAttachmentRow(null)} />}
      {decisionDialog && <ApprovalDecisionDialog state={decisionDialog} note={decisionNote} amount={decisionAmount} error={decisionError} pending={pending} onNoteChange={setDecisionNote} onAmountChange={setDecisionAmount} onClose={closeDecisionDialog} onSubmit={submitDecision} />}
    </section>
    </Tooltip.Provider>
  );
}

function ApprovalDecisionDialog({ state, note, amount, error, pending, onNoteChange, onAmountChange, onClose, onSubmit }: {
  state: DecisionDialogState;
  note: string;
  amount: string;
  error: string | null;
  pending: boolean;
  onNoteChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { row, status, edit } = state;
  const requiresAmount = status === "approved" && row.kind !== "attendance";
  const title = edit ? `Edit ${labelFor(row.kind)} decision` : status === "rejected" ? `Reject ${labelFor(row.kind)}` : `Approve ${labelFor(row.kind)}`;
  const noteLabel = edit ? "Update decision note" : status === "rejected" ? "Reason for rejection (required)" : "Decision note (optional)";
  const submitLabel = edit ? "Save changes" : status === "rejected" ? "Reject" : "Approve";

  return <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-4" role="presentation" onMouseDown={onClose}>
    <form role="dialog" aria-modal="true" aria-labelledby="approval-decision-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="approval-decision-title" className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{row.employeeName} · {row.periodMonth ?? "No period"}</p>
        </div>
        <button type="button" onClick={onClose} disabled={pending} aria-label="Close decision form" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"><X size={18} aria-hidden /></button>
      </div>

      <div className="mt-5 space-y-4">
        {requiresAmount && <label className="block text-sm font-bold text-slate-800">Approved amount<input type="number" value={amount} onChange={(event) => onAmountChange(event.target.value)} disabled={pending} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50" /></label>}
        <label className="block text-sm font-bold text-slate-800">{noteLabel}<textarea value={note} onChange={(event) => onNoteChange(event.target.value)} disabled={pending} autoFocus rows={4} maxLength={800} className="mt-1.5 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-50" /></label>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={pending} className={`inline-flex min-w-24 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${status === "rejected" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{pending ? <Loader2 size={16} className="animate-spin" aria-label="Saving" /> : submitLabel}</button>
      </div>
    </form>
  </div>;
}

function ReimbursementAttachmentCell({ row, onOpen }: { row: ApprovalRow; onOpen: () => void }) {
  const documentCount = row.attachmentCount ?? 0;
  const hasDocuments = documentCount > 0;
  const hasReceiptLink = !!row.receiptUrl;
  if (!hasDocuments && !hasReceiptLink) return <td className="px-4 py-3 text-slate-400">-</td>;

  return <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-2">
    {hasDocuments && <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-red-200 hover:text-red-700"><Paperclip size={14} aria-hidden /> {documentCount} {documentCount === 1 ? "document" : "documents"}</button>}
    {hasReceiptLink && <a href={row.receiptUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-red-700"><ExternalLink size={14} aria-hidden /> Receipt link</a>}
  </div></td>;
}

function ReimbursementAttachmentsDialog({ row, files, error, loading, onClose }: { row: ApprovalRow; files: ClaimAttachmentView[] | null; error: string | null; loading: boolean; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-4" role="presentation" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="reimbursement-documents-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><h2 id="reimbursement-documents-title" className="text-lg font-bold text-slate-900">Reimbursement documents</h2><p className="mt-1 text-sm text-slate-600">{row.employeeName} · {row.periodMonth ?? "No period"}</p></div><button type="button" onClick={onClose} aria-label="Close documents" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={18} aria-hidden /></button></div>
      <div className="mt-5">
        {loading && <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-600"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading documents...</p>}
        {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
        {!loading && !error && files?.length === 0 && <p className="text-sm text-slate-600">No stored documents are available for this claim.</p>}
        {!loading && !error && files && files.length > 0 && <ul className="space-y-2">{files.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={file.fileName}>{file.fileName}</span>{file.url ? <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-red-700 hover:text-red-800"><ExternalLink size={14} aria-hidden /> {file.inline ? "View" : "Download"}</a> : <span className="shrink-0 text-xs font-semibold text-rose-700">Unavailable</span>}</li>)}</ul>}
      </div>
    </div>
  </div>;
}

function DraggableApprovalHeader({
  column,
  kind,
  sort,
  dragging,
  onSort,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  column: ApprovalColumn;
  kind: ApprovalKind;
  sort: ApprovalSort;
  dragging: boolean;
  onSort: (key: ApprovalSortKey) => void;
  onDragStart: (event: ReactDragEvent<HTMLTableCellElement>, column: ApprovalColumn) => void;
  onDragEnd: () => void;
  onDrop: (event: ReactDragEvent<HTMLTableCellElement>, column: ApprovalColumn) => void;
}) {
  const label = labelForColumn(column, kind);
  const sortKey = sortKeyForColumn(column);
  const active = sortKey ? sort?.key === sortKey : false;
  const Icon = !active ? ChevronsUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
  const direction = active ? sort?.direction : null;
  const pinned = column === "employee";

  return (
    <th
      scope="col"
      draggable={!pinned}
      onDragStart={pinned ? undefined : (event) => onDragStart(event, column)}
      onDragOver={pinned ? undefined : (event) => event.preventDefault()}
      onDrop={pinned ? undefined : (event) => onDrop(event, column)}
      onDragEnd={onDragEnd}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
      className={`${pinned ? "sticky left-12 z-40 min-w-[240px] cursor-default bg-slate-50 shadow-[8px_0_10px_-12px_rgba(15,23,42,0.45)]" : "cursor-grab active:cursor-grabbing"} select-none whitespace-nowrap px-4 py-3 text-left ${dragging ? "bg-red-50 text-red-700" : ""}`}
      title={pinned ? "Employee column is pinned while scrolling" : `Drag ${label} to reorder columns`}
    >
      <div className="inline-flex items-center gap-1.5">
        {!pinned && <GripVertical size={14} strokeWidth={2.1} aria-hidden className="opacity-35" />}
        {sortKey ? (
          <button type="button" onClick={() => onSort(sortKey)} title={`Sort by ${label}`} className={`group/sort inline-flex items-center gap-1.5 font-bold uppercase transition-colors ${active ? "text-slate-900" : "text-slate-600 hover:text-slate-800"}`}>
            {label}
            <Icon size={13} strokeWidth={2.5} aria-hidden className={active ? "text-red-700" : "opacity-45 transition-opacity group-hover/sort:opacity-100"} />
          </button>
        ) : <span className="font-bold uppercase text-slate-600">{label}</span>}
      </div>
    </th>
  );
}

function NoteCell({ note }: { note: string | null }) {
  if (!note) return <td className="w-[240px] max-w-[240px] px-4 py-3 text-slate-400">-</td>;

  return (
    <td className="w-[240px] max-w-[240px] px-4 py-3 text-slate-600">
      <Tooltip.Root delayDuration={150}>
        <Tooltip.Trigger asChild>
          <button type="button" className="block w-full cursor-help truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-red-300" aria-label={`Full note: ${note}`}>
            {note}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="top" align="start" sideOffset={8} className="z-[90] max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case text-slate-700 shadow-lg">
            {note}
            <Tooltip.Arrow className="fill-white" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </td>
  );
}

function AttendanceWeeksTable({ row, openWeekIds, onToggleWeek }: { row: ApprovalRow; openWeekIds: string[]; onToggleWeek: (id: string) => void }) {
  const weeks = attendanceWeeks(row.daily);
  return <table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th colSpan={3} className="px-5 py-2.5">Week</th><th colSpan={2} className="px-4 py-2.5">Days</th><th className="px-4 py-2.5 text-right">Work hours</th><th className="px-5 py-2.5 text-right">Details</th></tr></thead><tbody>{weeks.map((week, index) => {
    const weekId = `${row.subjectId}:${week.start}`;
    const isOpen = openWeekIds.includes(weekId);
    const end = week.days.at(-1)?.date ?? week.start;
    const loggedMinutes = week.days.reduce((total, day) => total + (day.workedMinutes ?? 0), 0);
    const fullDays = week.days.filter((day) => day.code === "P").length;
    const absences = week.days.filter((day) => day.code === "A").length;
    return <Fragment key={weekId}><tr className="border-t border-slate-200 bg-white"><td colSpan={3} className="px-5 py-3 font-bold text-slate-900">Week {index + 1} <span className="font-medium text-slate-500">- {displayDate(week.start)} to {displayDate(end)}</span></td><td colSpan={2} className="px-4 py-3 text-slate-600">{fullDays} full day{fullDays === 1 ? "" : "s"}{absences ? ` · ${absences} absent` : ""}</td><td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{loggedMinutes ? displayDuration(loggedMinutes) : "-"}</td><td className="px-5 py-3 text-right"><button type="button" onClick={() => onToggleWeek(weekId)} aria-expanded={isOpen} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-slate-700 hover:text-red-700">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{isOpen ? "Collapse" : "View days"}</button></td></tr>{isOpen && <><tr className="border-y border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><th className="px-5 py-2.5">Date</th><th className="px-4 py-2.5">Day</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Check-in</th><th className="px-4 py-2.5">Check-out</th><th className="px-4 py-2.5 text-right">Work hours</th><th className="px-5 py-2.5 text-right">Record</th></tr>{week.days.map((day) => <tr key={day.date} className="border-t border-slate-100 bg-white text-slate-700"><td className="px-5 py-3 font-semibold text-slate-900">{displayDate(day.date)}</td><td className="px-4 py-3 text-slate-500">{displayDay(day.date)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${attendanceStatusTone(day.code)}`}>{attendanceStatusLabel[day.code] ?? day.code}</span></td><td className="px-4 py-3 tabular-nums">{displayTime(day.checkIn)}</td><td className="px-4 py-3 tabular-nums">{displayTime(day.checkOut)}</td><td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{displayDuration(day.workedMinutes)}</td><td className="px-5 py-3 text-right text-xs font-semibold text-slate-500">{day.workedMinutes == null ? "No punch" : "Recorded"}</td></tr>)}</>}</Fragment>;
  })}{weeks.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">No daily attendance entries are available for this period.</td></tr>}</tbody></table>;
}
