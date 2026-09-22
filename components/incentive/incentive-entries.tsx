"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Loader2, Pencil, Plus, Table2, Trash2, Undo2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { formatInr } from "@/lib/format";
import type { IncentiveEntryAdminRow } from "@/lib/queries/incentives";
import type { EmployeeOption } from "@/lib/queries/employees";
import {
  createIncentiveEntry,
  updateIncentiveEntry,
  deleteIncentiveEntry,
} from "@/app/(app)/incentive/admin-actions";
import { reverseIncentiveEntry } from "@/app/(app)/incentive/reversal-actions";
import { fireToast } from "@/lib/toast";
import { IncentiveImportDialog } from "./incentive-import-dialog";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { IncentiveBadge } from "./ui/badges";
import { IncentiveEmptyState } from "./ui/states";
import { INCENTIVE_BTN_NEUTRAL, INCENTIVE_BTN_PRIMARY } from "./ui/chrome";

type Mode = { kind: "create" } | { kind: "edit"; row: IncentiveEntryAdminRow } | null;

/**
 * THE INCENTIVE LEDGER (admin).
 *
 * The same rows, the same three actions and the same server actions as before.
 * What changed is that a whole year of entries is no longer one unbounded
 * `<tbody>` with no search: it is the shared `DataTable`, so it has search,
 * month / incentive / approved / paid filters, sortable columns and paging —
 * and a note that used to be invisible here now shows in the row's detail.
 *
 * Delete used to fire the moment the bin was clicked. It goes through the
 * module's confirmation now, which names the entry; the action itself is
 * untouched.
 */
export function IncentiveEntries({
  rows,
  employees,
  year,
}: {
  rows: IncentiveEntryAdminRow[];
  employees: EmployeeOption[];
  year: number;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [deleting, startDelete] = React.useTransition();
  const [pendingDelete, setPendingDelete] = React.useState<IncentiveEntryAdminRow | null>(null);
  const [reversing, startReverse] = React.useTransition();
  const [pendingReverse, setPendingReverse] = React.useState<IncentiveEntryAdminRow | null>(null);

  function confirmReverse() {
    const row = pendingReverse;
    if (!row) return;
    startReverse(async () => {
      const res = await reverseIncentiveEntry({ id: row.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setPendingReverse(null);
      fireToast({
        message:
          res.skipped
            ? "Already adjusted — a negative payable adjustment is already recorded."
            : res.reversalAmount < 0
              ? `Negative payable adjustment of ${formatInr(res.reversalAmount)} recorded.`
              : "Marked as adjusted — nothing was paid, so no adjustment was recorded.",
      });
      router.refresh();
    });
  }

  function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    startDelete(async () => {
      const res = await deleteIncentiveEntry({ id: row.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setPendingDelete(null);
      fireToast({ message: "Entry deleted." });
      router.refresh();
    });
  }

  /** The months present in the data — a filter built from what is there. */
  const months = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const m = r.periodMonth?.slice(0, 7);
      if (m && !seen.has(m)) seen.set(m, fmtMonth(r.periodMonth));
    }
    return [...seen.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, label]) => ({ value, label }));
  }, [rows]);

  const incentiveNames = React.useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.incentiveName) seen.add(r.incentiveName);
    return [...seen].sort().map((n) => ({ value: n, label: n }));
  }, [rows]);

  const columns: DataTableColumn<IncentiveEntryAdminRow>[] = [
    {
      key: "employee",
      label: "Employee",
      sortValue: (r) => r.empName.toLowerCase(),
      render: (r) => (
        <span className="flex items-center gap-2">
          <EmployeeAvatar name={r.empName} size="sm" />
          <span className="text-[13.5px] font-bold text-ink-strong">{r.empName}</span>
        </span>
      ),
    },
    {
      key: "incentive",
      label: "Incentive",
      sortValue: (r) => r.incentiveName.toLowerCase(),
      render: (r) => <span className="text-[13px] font-semibold text-ink-soft">{r.incentiveName}</span>,
    },
    {
      key: "month",
      label: "Month",
      sortValue: (r) => r.periodMonth ?? "",
      render: (r) => <span className="text-[13px] tabular-nums text-ink-subtle">{fmtMonth(r.periodMonth)}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortValue: (r) => r.amount,
      render: (r) => <span className="text-[13px] tabular-nums">{formatInr(r.amount)}</span>,
    },
    {
      key: "approved",
      label: "Approved",
      align: "right",
      sortValue: (r) => r.approvedAmt,
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {r.approved && <IncentiveBadge tone="green">✓</IncentiveBadge>}
          <span className="text-[13px] tabular-nums">{formatInr(r.approvedAmt)}</span>
        </span>
      ),
    },
    {
      key: "paid",
      label: "Paid",
      align: "right",
      sortValue: (r) => r.paidAmt,
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {r.reversed && <IncentiveBadge tone="red">Negative payable adj.</IncentiveBadge>}
          {r.paid && !r.reversed && <IncentiveBadge tone="teal">✓</IncentiveBadge>}
          <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(r.paidAmt)}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} · {year}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <IncentiveImportDialog />
          <button type="button" onClick={() => setMode({ kind: "create" })} className={INCENTIVE_BTN_PRIMARY}>
            <Plus size={14} strokeWidth={2.8} />
            Add entry
          </button>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        searchText={(r) => `${r.empName} ${r.incentiveName} ${r.note ?? ""}`}
        searchPlaceholder="Local search — employee or incentive"
        initialSort={{ key: "month", dir: "desc" }}
        stickyFirstColumn
        dense
        pageSize={25}
        filters={[
          ...(months.length > 1 ? [{ label: "Month", options: months, match: (r: IncentiveEntryAdminRow, v: string) => r.periodMonth?.slice(0, 7) === v }] : []),
          ...(incentiveNames.length > 1
            ? [
                {
                  label: "Incentive",
                  options: incentiveNames,
                  match: (r: IncentiveEntryAdminRow, v: string) => r.incentiveName === v,
                },
              ]
            : []),
          {
            label: "Approved",
            options: [
              { value: "yes", label: "Approved" },
              { value: "no", label: "Not approved" },
            ],
            match: (r, v) => (v === "yes" ? r.approved : !r.approved),
          },
          {
            label: "Paid",
            options: [
              { value: "yes", label: "Paid" },
              { value: "part", label: "Partly paid" },
              { value: "no", label: "Unpaid" },
            ],
            match: (r, v) =>
              v === "yes"
                ? r.paidAmt > 0 && r.paidAmt >= r.approvedAmt
                : v === "part"
                  ? r.paidAmt > 0 && r.paidAmt < r.approvedAmt
                  : r.paidAmt === 0,
          },
        ]}
        renderRowDetail={(r) => (
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Outstanding</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink-soft">
                {formatInr(Math.max(0, r.approvedAmt - r.paidAmt))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Approved</dt>
              <dd className="mt-0.5 font-semibold text-ink-soft">{r.approved ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Paid</dt>
              <dd className="mt-0.5 font-semibold text-ink-soft">{r.paid ? "Yes" : "No"}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Note</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-ink-strong">{r.note || "—"}</dd>
            </div>
          </dl>
        )}
        rowActions={(r) => (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label={`Edit ${r.incentiveName} for ${r.empName}`}
              onClick={() => setMode({ kind: "edit", row: r })}
              className="grid size-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <Pencil size={14} strokeWidth={2.3} />
            </button>
            {r.paidAmt > 0 && !r.reversed && (
              <button
                type="button"
                aria-label={`Record a negative payable adjustment for ${r.incentiveName} (${r.empName})`}
                onClick={() => setPendingReverse(r)}
                className="grid size-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
                title="Record a negative payable adjustment on this paid incentive"
              >
                <Undo2 size={14} strokeWidth={2.3} />
              </button>
            )}
            <button
              type="button"
              aria-label={`Delete ${r.incentiveName} for ${r.empName}`}
              onClick={() => setPendingDelete(r)}
              className="grid size-9 place-items-center rounded-lg transition-colors hover:bg-surface-soft"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              <Trash2 size={14} strokeWidth={2.3} />
            </button>
          </div>
        )}
        emptyState={
          <IncentiveEmptyState
            icon={Table2}
            title={`No incentive entries in ${year}`}
            body="Add one with the button above, or import a sheet to bring a whole month in at once."
          />
        }
      />

      <EntryDialog mode={mode} employees={employees} onClose={() => setMode(null)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this incentive entry?"
        body={
          pendingDelete ? (
            <>
              <b className="text-ink-strong">{pendingDelete.incentiveName}</b> for{" "}
              <b className="text-ink-strong">{pendingDelete.empName}</b> ({formatInr(pendingDelete.amount)},{" "}
              {fmtMonth(pendingDelete.periodMonth)}) will be removed from the ledger. This cannot be
              undone, and it changes what the dashboard, targets and payout read.
            </>
          ) : null
        }
        confirmLabel="Delete entry"
        pending={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={pendingReverse !== null}
        onOpenChange={(o) => !o && setPendingReverse(null)}
        title="Record a negative payable adjustment?"
        body={
          pendingReverse ? (
            <>
              <b className="text-ink-strong">{pendingReverse.incentiveName}</b> for{" "}
              <b className="text-ink-strong">{pendingReverse.empName}</b> ({formatInr(pendingReverse.paidAmt)} paid
              {pendingReverse.periodMonth ? `, ${fmtMonth(pendingReverse.periodMonth)}` : ""}) will be adjusted. A
              negative payable adjustment of <b className="text-ink-strong">{formatInr(-pendingReverse.paidAmt)}</b> is
              recorded against the employee&apos;s payable. The original payment stays on record.
            </>
          ) : null
        }
        confirmLabel="Record adjustment"
        pending={reversing}
        onConfirm={confirmReverse}
      />
    </div>
  );
}

/* ─────────────────────────── add / edit dialog ─────────────────────────── */

function EntryDialog({
  mode,
  employees,
  onClose,
}: {
  mode: Mode;
  employees: EmployeeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const editing = mode?.kind === "edit" ? mode.row : null;

  const [empId, setEmpId] = React.useState("");
  const [empName, setEmpName] = React.useState("");
  const [incentiveName, setIncentiveName] = React.useState("");
  const [periodMonth, setPeriodMonth] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [approved, setApproved] = React.useState(false);
  const [approvedAmt, setApprovedAmt] = React.useState("");
  const [paid, setPaid] = React.useState(false);
  const [paidAmt, setPaidAmt] = React.useState("");
  const [note, setNote] = React.useState("");

  // Hydrate when (re)opening.
  React.useEffect(() => {
    if (!mode) return;
    const r = mode.kind === "edit" ? mode.row : null;
    setEmpId(r?.employeeId ?? "");
    setEmpName(r?.empName ?? "");
    setIncentiveName(r?.incentiveName ?? "");
    setPeriodMonth(r?.periodMonth ? r.periodMonth.slice(0, 7) : "");
    setAmount(r ? String(r.amount) : "");
    setApproved(r?.approved ?? false);
    setApprovedAmt(r ? String(r.approvedAmt) : "");
    setPaid(r?.paid ?? false);
    setPaidAmt(r ? String(r.paidAmt) : "");
    setNote(r?.note ?? "");
  }, [mode]);

  function pickEmployee(id: string) {
    setEmpId(id);
    const e = employees.find((x) => x.id === id);
    if (e) setEmpName(e.name);
  }

  function num(s: string): number {
    const n = Number(s.replace(/\brs\.?/gi, "").replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empName.trim()) {
      fireToast({ message: "Employee name is required.", type: "error" });
      return;
    }
    if (!incentiveName.trim()) {
      fireToast({ message: "Incentive name is required.", type: "error" });
      return;
    }
    const payload = {
      empName: empName.trim(),
      employeeId: empId || null,
      incentiveName: incentiveName.trim(),
      periodMonth: periodMonth ? `${periodMonth}-01` : null,
      amount: num(amount),
      approved,
      approvedAmt: num(approvedAmt),
      paid,
      paidAmt: num(paidAmt),
      note: note.trim() || null,
    };
    startTransition(async () => {
      const res = editing
        ? await updateIncentiveEntry({ id: editing.id, ...payload })
        : await createIncentiveEntry(payload);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: editing ? "Entry updated." : "Entry created." });
      router.refresh();
      onClose();
    });
  }

  const empOptions = employees.map((e) => ({ value: e.id, label: e.name }));

  return (
    <Dialog.Root open={mode != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90]" style={{ background: "rgba(15,23,42,0.45)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-hairline bg-surface-card p-5"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <Dialog.Title className="text-[16px] font-bold text-ink-strong">
            {editing ? "Edit incentive entry" : "Add incentive entry"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] font-medium text-ink-muted">
            Pick an employee from the roster and the name fills in; type a name instead for someone
            not on it. The roster link is what lets the dashboard place this entry with a person.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Employee (roster)">
                <Select
                  options={empOptions}
                  value={empId}
                  onValueChange={pickEmployee}
                  placeholder="— Select employee —"
                  ariaLabel="Employee"
                  searchable
                />
              </Field>
              <Field label="Employee name" required>
                <Input value={empName} onChange={setEmpName} placeholder="Name (free text)" />
              </Field>
              <Field label="Incentive name" required>
                <Input value={incentiveName} onChange={setIncentiveName} placeholder="e.g. New Client" />
              </Field>
              <Field label="Period month">
                <input
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Amount (Rs.)">
              <Input value={amount} onChange={setAmount} placeholder="0" numeric />
            </Field>

            {/* Each flag sits WITH the amount it governs — they used to be in
                two unrelated rows, so "Approved" and "Approved Amt" read as
                separate facts. */}
            <div className="grid gap-3.5 sm:grid-cols-2">
              <AmountWithFlag
                label="Approved amount (Rs.)"
                flagLabel="Approved"
                value={approvedAmt}
                onValue={setApprovedAmt}
                checked={approved}
                onChecked={setApproved}
              />
              <AmountWithFlag
                label="Paid amount (Rs.)"
                flagLabel="Paid"
                value={paidAmt}
                onValue={setPaidAmt}
                checked={paid}
                onChecked={setPaid}
              />
            </div>

            <Field label="Note">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                className={`${inputClass} h-auto py-2`}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button type="button" className={INCENTIVE_BTN_NEUTRAL} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" disabled={pending} className={INCENTIVE_BTN_PRIMARY}>
                {pending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Check size={14} strokeWidth={2.6} aria-hidden />
                )}
                {pending ? "Saving…" : editing ? "Save changes" : "Create entry"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputClass =
  "h-9 w-full rounded-pill border border-hairline bg-surface-card px-3.5 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red";

function Input({
  value,
  onChange,
  placeholder,
  numeric = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={numeric ? "numeric" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${numeric ? "tabular-nums" : ""}`}
    />
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-bold text-ink-strong">
        {label}
        {required && <span className="ml-0.5 text-altus-red">*</span>}
      </label>
      {children}
    </div>
  );
}

/** An amount and the flag that says it is settled, as one control. */
function AmountWithFlag({
  label,
  flagLabel,
  value,
  onValue,
  checked,
  onChecked,
}: {
  label: string;
  flagLabel: string;
  value: string;
  onValue: (v: string) => void;
  checked: boolean;
  onChecked: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-hairline p-3">
      <label className="mb-1.5 block text-[13px] font-bold text-ink-strong">{label}</label>
      <Input value={value} onChange={onValue} placeholder="0" numeric />
      <label className="mt-2 inline-flex cursor-pointer select-none items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
          className="size-4 accent-[var(--color-altus-red)]"
        />
        <span className="text-[13px] font-semibold text-ink-soft">Mark as {flagLabel.toLowerCase()}</span>
      </label>
    </div>
  );
}

function fmtMonth(d: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})/);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[+m[2]! - 1]} ${m[1]}`;
}
