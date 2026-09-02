"use client";

import { useState, useEffect, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, MoreHorizontal, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  decideIncentiveRequest,
  setIncentiveAmount,
  setIncentivePayment,
  setIncentiveConditions,
  setIncentiveArchived,
  setIncentiveEmployee,
  deleteIncentiveEntry,
} from "@/app/(app)/incentive/actions";

type EmployeeOption = { id: string; name: string };

/** Date · Month-Year · Employee · Participant · Prospect for a sheet entry. */
function sheetPairs(row: IncentiveRequestRow): [string, string][] {
  const d = row.details ?? {};
  return ([
    ["Date", d.date],
    ["Month-Year", d.month],
    ["Employee Name", row.employeeName],
    ["Participant Name", d.participant],
    ["Prospect Name", d.prospect],
  ] as [string, string | undefined][]).filter(([, v]) => v && v.trim()) as [string, string][];
}
import {
  INCENTIVE_STATUS_LABELS,
  type IncentiveStatus,
} from "@/db/enums";
import { incentiveDetailPairs } from "@/lib/incentive-fields";
import { INCENTIVE_CONDITION_FIELDS, incentiveUnpaid, incentiveDisplayName } from "@/lib/incentive-amount";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import { formatDate } from "@/lib/format";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const STATUS_STYLE: Record<IncentiveStatus, { bg: string; fg: string }> = {
  pending:  { bg: "rgba(245,158,11,0.12)", fg: "#B45309" },
  approved: { bg: "rgba(22,163,74,0.12)",  fg: "#15803D" },
  rejected: { bg: "rgba(225,6,0,0.10)",    fg: "#A80400" },
};

export function IncentiveList({
  rows,
  isAdmin,
  view = "active",
  employees = [],
}: {
  rows: IncentiveRequestRow[];
  isAdmin: boolean;
  view?: "active" | "archived";
  employees?: EmployeeOption[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[15px] text-ink-subtle">
        {view === "archived"
          ? "Nothing archived."
          : "No incentive requests yet — file the first one with “New request”."}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <RequestCard key={r.id} row={r} isAdmin={isAdmin} view={view} employees={employees} />
      ))}
    </ul>
  );
}

function RequestCard({ row, isAdmin, view, employees }: { row: IncentiveRequestRow; isAdmin: boolean; view: "active" | "archived"; employees: EmployeeOption[] }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const pairs =
    row.type === "sheet"
      ? sheetPairs(row)
      : (row.type === "project" || row.type === "weekly_goal")
        ? []
        : incentiveDetailPairs(row.type, row.details);
  const style = STATUS_STYLE[row.status];

  function decide(verdict: "approved" | "rejected") {
    startTransition(async () => {
      const res = await decideIncentiveRequest({ id: row.id, verdict });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: verdict === "approved" ? "Request approved." : "Request rejected.",
        type: verdict === "approved" ? "success" : "info",
      });
    });
  }

  return (
    <li
      className="rounded-section bg-surface-card p-5 max-md:p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[16px] font-semibold text-ink-strong">
              {incentiveDisplayName(row.type, row.label)}
            </span>
            <span
              className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold"
              style={{ background: style.bg, color: style.fg }}
            >
              {INCENTIVE_STATUS_LABELS[row.status]}
            </span>
            <span className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold tabular-nums"
              style={{ background: "rgba(15,23,42,0.06)", color: "#0F172A" }}>
              {inr(row.amount)}
            </span>
            {row.status === "approved" && (
              <span className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold tabular-nums"
                style={ row.paid && incentiveUnpaid(row) === 0
                  ? { background: "rgba(22,163,74,0.12)", color: "#15803D" }
                  : { background: "rgba(245,158,11,0.14)", color: "#B45309" } }>
                {row.paid && incentiveUnpaid(row) === 0 ? "Paid" : `${inr(incentiveUnpaid(row))} unpaid`}
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-ink-subtle mt-1">
            {isAdmin ? `${row.employeeName} · ` : ""}
            {formatDate(row.createdAt)}
            {row.decidedByName &&
              ` · ${row.status === "approved" ? "approved" : "decided"} by ${row.decidedByName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && row.status === "pending" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("approved")}
                className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("rejected")}
                className="rounded-md px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
                style={{
                  background: "rgba(225,6,0,0.08)",
                  color: "#A80400",
                  border: "1px solid rgba(225,6,0,0.25)",
                }}
              >
                Reject
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-soft"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            Details
          </button>
          {isAdmin && <CardMenu row={row} view={view} />}
        </div>
      </div>

      {expanded && (
        <dl
          className="mt-4 grid grid-cols-2 max-md:grid-cols-1 gap-x-6 gap-y-2.5 border-t pt-4"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          {pairs.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                {label}
              </dt>
              <dd className="text-[14.5px] text-ink-strong mt-0.5 break-words">{value}</dd>
            </div>
          ))}
          {row.decisionNote && (
            <div className="col-span-full">
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                Decision note
              </dt>
              <dd className="text-[14.5px] text-ink-strong mt-0.5">{row.decisionNote}</dd>
            </div>
          )}
          {isAdmin && <AdminLedger row={row} employees={employees} />}
        </dl>
      )}
    </li>
  );
}

/** Admin-only payout controls: amount override, paid tracking, conditions. */
function AdminLedger({ row, employees }: { row: IncentiveRequestRow; employees: EmployeeOption[] }) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(row.amount));
  const [empId, setEmpId] = useState(row.employeeId);
  const [paid, setPaid] = useState(row.paid);
  const [paidAmt, setPaidAmt] = useState(String(row.paidAmt));
  const [paidDate, setPaidDate] = useState(row.paidDate ?? "");
  const conditionFields = (row.type === "project" || row.type === "sheet" || row.type === "weekly_goal") ? [] : (INCENTIVE_CONDITION_FIELDS[row.type] ?? []);
  const [conds, setConds] = useState<Record<string, string>>(row.conditions ?? {});

  function saveAmount() {
    start(async () => {
      const res = await setIncentiveAmount({ id: row.id, amount: Number(amount) || 0 });
      fireToast(res.ok ? { message: "Amount updated.", type: "success" } : { message: res.error, type: "error" });
    });
  }
  function saveEmployee(next: string) {
    setEmpId(next);
    start(async () => {
      const res = await setIncentiveEmployee({ id: row.id, employeeId: next });
      fireToast(res.ok ? { message: "Employee updated.", type: "success" } : { message: res.error, type: "error" });
    });
  }
  function savePayment(nextPaid: boolean) {
    setPaid(nextPaid);
    start(async () => {
      const res = await setIncentivePayment({
        id: row.id, paid: nextPaid,
        paidAmt: Number(paidAmt) || 0,
        paidDate: paidDate || null,
      });
      fireToast(res.ok ? { message: "Payment saved.", type: "success" } : { message: res.error, type: "error" });
    });
  }
  function saveCond(key: string, value: string) {
    const next = { ...conds, [key]: value };
    setConds(next);
    start(async () => {
      await setIncentiveConditions({ id: row.id, conditions: next });
    });
  }

  const lbl = "text-[12px] font-semibold uppercase tracking-wide text-ink-subtle";
  const inp = "mt-1 w-full rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] outline-none focus:border-altus-red/50";

  return (
    <div className="col-span-full mt-2 rounded-xl border border-dashed border-hairline p-4 bg-black/[0.015]">
      <p className="text-[12px] font-black uppercase tracking-[0.05em] text-altus-red mb-3">Admin · Payout</p>
      {employees.length > 0 && (
        <div className="mb-3">
          <span className={lbl}>Employee (earns this incentive)</span>
          <select value={empId} disabled={pending}
            onChange={(e) => saveEmployee(e.target.value)} className={inp}>
            {employees.some((e) => e.id === empId) ? null : <option value={empId}>{row.employeeName}</option>}
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 items-end">
        <div>
          <span className={lbl}>Amount ₹</span>
          <input type="number" min={0} value={amount} disabled={pending}
            onChange={(e) => setAmount(e.target.value)} onBlur={saveAmount} className={inp} />
        </div>
        <div>
          <span className={lbl}>Paid?</span>
          <select value={paid ? "yes" : "no"} disabled={pending}
            onChange={(e) => savePayment(e.target.value === "yes")} className={inp}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div>
          <span className={lbl}>Paid Amt ₹</span>
          <input type="number" min={0} value={paidAmt} disabled={pending}
            onChange={(e) => setPaidAmt(e.target.value)} onBlur={() => savePayment(paid)} className={inp} />
        </div>
        <div>
          <span className={lbl}>Paid Date</span>
          <input type="date" value={paidDate} disabled={pending}
            onChange={(e) => setPaidDate(e.target.value)} onBlur={() => savePayment(paid)} className={inp} />
        </div>
      </div>
      {conditionFields.length > 0 && (
        <div className="mt-3 grid grid-cols-3 max-md:grid-cols-1 gap-3">
          {conditionFields.map((f) => (
            <div key={f.key}>
              <span className={lbl}>{f.label}</span>
              <select value={conds[f.key] ?? ""} disabled={pending}
                onChange={(e) => saveCond(f.key, e.target.value)} className={inp}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12px] font-semibold text-ink-muted tabular-nums">
        Unpaid (after approval): {inr(incentiveUnpaid({ status: row.status, amount: Number(amount) || 0, paidAmt: Number(paidAmt) || 0 }))}
      </p>
    </div>
  );
}

/** 3-dots overflow menu — Archive / Restore + Delete (admin only). */
function CardMenu({ row, view }: { row: IncentiveRequestRow; view: "active" | "archived" }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  function archive(next: boolean) {
    setOpen(false);
    start(async () => {
      const res = await setIncentiveArchived({ id: row.id, archived: next });
      fireToast(res.ok
        ? { message: next ? "Archived." : "Restored.", type: "success" }
        : { message: res.error, type: "error" });
    });
  }
  function performDelete() {
    start(async () => {
      const res = await deleteIncentiveEntry({ id: row.id });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setConfirmOpen(false);
      fireToast({ message: "Deleted.", type: "success" });
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="inline-flex items-center justify-center size-9 rounded-md text-ink-soft hover:bg-surface-soft disabled:opacity-50"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-hairline bg-white p-1.5 shadow-xl"
            style={{ boxShadow: "0 12px 28px -10px rgba(15,23,42,0.22)" }}
          >
            {view === "archived" ? (
              <button type="button" onClick={() => archive(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-strong hover:bg-surface-soft">
                <ArchiveRestore size={15} /> Restore
              </button>
            ) : (
              <button type="button" onClick={() => archive(true)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-strong hover:bg-surface-soft">
                <Archive size={15} /> Archive
              </button>
            )}
            <button type="button" onClick={() => { setOpen(false); setConfirmOpen(true); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium text-[#A80400] hover:bg-[#FEF2F2]">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </>
      )}
      <DeleteIncentiveDialog
        row={row}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={pending}
        onConfirm={performDelete}
      />
    </div>
  );
}

/**
 * Two-step delete confirmation — same pattern as the project-tree delete dialog.
 * Step 1 spells out what's being removed; step 2 requires typing the incentive's
 * name before the destructive button enables, so nothing is deleted by a stray
 * click.
 */
function DeleteIncentiveDialog({
  row,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  row: IncentiveRequestRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const name = incentiveDisplayName(row.type, row.label);

  useEffect(() => {
    if (!open) { setStep(1); setTyped(""); }
  }, [open]);

  const confirmable = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{ border: "1px solid var(--color-hairline-strong)", boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span aria-hidden className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red)" }}>
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-ink-strong"
                style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 22, letterSpacing: "-0.01em" }}>
                Delete incentive?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                {step === 1 ? "Step 1 of 2 — review what will be removed." : "Step 2 of 2 — confirm to finish."}
              </Dialog.Description>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className="rounded-chip p-4 mb-4"
                style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}>
                <p className="text-[15px] text-ink-strong font-semibold break-words">“{name}”</p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
                  <li>• {row.employeeName} · {inr(row.amount)}</li>
                  <li>• Removes this incentive and its full payout record.</li>
                  <li>• This <strong>cannot be undone</strong>. Prefer Archive if unsure.</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => onOpenChange(false)}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={() => setStep(2)}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-soft mb-2" style={{ lineHeight: 1.55 }}>
                Type the incentive name <span className="font-bold text-ink-strong">{name}</span> to confirm deletion.
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && confirmable && !pending) onConfirm(); }}
                placeholder={name}
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none focus:border-altus-red mb-4"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <div className="flex justify-between gap-2">
                <button type="button" onClick={() => setStep(1)} disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-50">
                  ← Back
                </button>
                <button type="button" onClick={onConfirm} disabled={!confirmable || pending}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                  {pending ? "Deleting…" : "Permanently delete"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
