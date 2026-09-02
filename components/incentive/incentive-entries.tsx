"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Pencil, Trash2, Loader2, Check } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatInr } from "@/lib/format";
import type { IncentiveEntryAdminRow } from "@/lib/queries/incentives";
import type { EmployeeOption } from "@/lib/queries/employees";
import {
  createIncentiveEntry,
  updateIncentiveEntry,
  deleteIncentiveEntry,
} from "@/app/(app)/incentive/admin-actions";
import { fireToast } from "@/lib/toast";
import { IncentiveImportDialog } from "./incentive-import-dialog";

type Mode = { kind: "create" } | { kind: "edit"; row: IncentiveEntryAdminRow } | null;

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
  const [delId, setDelId] = React.useState<string | null>(null);

  function onDelete(id: string) {
    setDelId(id);
    startDelete(async () => {
      const res = await deleteIncentiveEntry({ id });
      setDelId(null);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Entry deleted." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-semibold text-ink-subtle" style={{ fontSize: 13.5 }}>
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} · {year}
        </p>
        <div className="flex items-center gap-2">
          <IncentiveImportDialog />
          <button
            type="button"
            onClick={() => setMode({ kind: "create" })}
            className="wg-btn wg-sheen inline-flex cursor-pointer items-center gap-2 rounded-full px-4 h-10 font-bold text-white"
            style={{
              fontSize: 13.5,
              background: "linear-gradient(135deg, #E10600, #A80400)",
              boxShadow:
                "0 8px 20px -10px rgba(168,4,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <Plus size={16} strokeWidth={2.6} />
            Add Entry
          </button>
        </div>
      </div>

      <section
        className="wg-rise rounded-[22px] bg-surface-card overflow-hidden"
        style={{
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        }}
      >
        {rows.length === 0 ? (
          <p className="font-semibold text-ink-subtle p-7" style={{ fontSize: 14 }}>
            No incentive entries this year. Add one or import a sheet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--color-surface-soft)" }}>
                  <Th>Employee</Th>
                  <Th>Incentive</Th>
                  <Th>Month</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Approved</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <td className="px-3.5 py-2.5 whitespace-nowrap" style={{ fontSize: 13.5 }}>
                      <span className="flex items-center gap-2.5">
                        <EmployeeAvatar name={r.empName} size="sm" />
                        <span className="font-bold text-ink-strong">{r.empName}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-ink-soft whitespace-nowrap" style={{ fontSize: 13.5 }}>
                      {r.incentiveName}
                    </td>
                    <Td subtle>{fmtMonth(r.periodMonth)}</Td>
                    <Td align="right">{formatInr(r.amount)}</Td>
                    <Td align="right">
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        {r.approved && <Check size={13} strokeWidth={3} style={{ color: "var(--color-green-deep)" }} />}
                        {formatInr(r.approvedAmt)}
                      </span>
                    </Td>
                    <Td align="right" tone={r.paid ? "green" : undefined}>
                      {formatInr(r.paidAmt)}
                    </Td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Edit"
                          onClick={() => setMode({ kind: "edit", row: r })}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong transition-colors"
                        >
                          <Pencil size={14} strokeWidth={2.3} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete"
                          disabled={deleting && delId === r.id}
                          onClick={() => onDelete(r.id)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-subtle hover:bg-surface-soft transition-colors disabled:opacity-50"
                          style={{ color: deleting && delId === r.id ? undefined : undefined }}
                        >
                          {deleting && delId === r.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} strokeWidth={2.3} style={{ color: "var(--color-red-deep)" }} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EntryDialog mode={mode} employees={employees} onClose={() => setMode(null)} />
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
    const n = Number(s.replace(/[₹,\s]/g, ""));
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
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-section bg-surface-card border border-hairline p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title
            className="text-ink-strong mb-1"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 21 }}
          >
            {editing ? "Edit Incentive Entry" : "Add Incentive Entry"}
          </Dialog.Title>
          <Dialog.Description className="text-ink-subtle font-semibold mb-4" style={{ fontSize: 13.5 }}>
            Pick an employee from the roster, or type a name for someone not listed.
          </Dialog.Description>

          <form onSubmit={submit} className="space-y-3.5">
            <Field label="Employee (Roster)">
              <Select
                options={empOptions}
                value={empId}
                onValueChange={pickEmployee}
                placeholder="— Select employee —"
                ariaLabel="Employee"
                searchable
              />
            </Field>
            <Field label="Employee Name" required>
              <Input value={empName} onChange={setEmpName} placeholder="Name (free text)" />
            </Field>
            <Field label="Incentive Name" required>
              <Input value={incentiveName} onChange={setIncentiveName} placeholder="e.g. New Client" />
            </Field>
            <Field label="Period Month">
              <input
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <Field label="Amount (₹)">
                <Input value={amount} onChange={setAmount} placeholder="0" numeric />
              </Field>
              <Field label="Approved Amt (₹)">
                <Input value={approvedAmt} onChange={setApprovedAmt} placeholder="0" numeric />
              </Field>
              <Field label="Paid Amt (₹)">
                <Input value={paidAmt} onChange={setPaidAmt} placeholder="0" numeric />
              </Field>
            </div>
            <div className="flex items-center gap-6">
              <Checkbox label="Approved" checked={approved} onChange={setApproved} />
              <Checkbox label="Paid" checked={paid} onChange={setPaid} />
            </div>
            <Field label="Note">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                className={inputClass}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button type="button" className="bg-surface-card px-4 py-2.5 font-semibold text-ink-subtle" style={{ fontSize: 14 }} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="wg-btn wg-sheen inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50"
                style={{
                  fontSize: 14,
                  background: "linear-gradient(135deg, #E10600, #A80400)",
                  boxShadow:
                    "0 10px 24px -12px rgba(168,4,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.6} />}
                {pending ? "Saving…" : editing ? "Save Changes" : "Create Entry"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputClass =
  "w-full rounded-chip border border-hairline bg-surface-card px-3.5 py-2.5 text-ink-strong outline-none focus:border-altus-red focus:ring-2 focus:ring-altus-red/25 transition-all";

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
      style={{ fontSize: 14.5 }}
    />
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-semibold text-ink-strong mb-1.5" style={{ fontSize: 13 }}>
        {label}
        {required && <span className="text-altus-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-altus-red)]"
      />
      <span className="font-semibold text-ink-strong" style={{ fontSize: 13.5 }}>
        {label}
      </span>
    </label>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-3.5 py-2.5 uppercase font-bold tracking-[0.05em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 10.5, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  subtle = false,
  tone,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  subtle?: boolean;
  tone?: "green";
}) {
  const color = tone === "green" ? "var(--color-green-deep)" : subtle ? "var(--color-ink-subtle)" : "var(--color-ink-soft)";
  return (
    <td
      className="px-3.5 py-2.5 tabular-nums whitespace-nowrap font-semibold"
      style={{ fontSize: 13.5, textAlign: align, color }}
    >
      {children}
    </td>
  );
}

function fmtMonth(d: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})/);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[+m[2]! - 1]} ${m[1]}`;
}
