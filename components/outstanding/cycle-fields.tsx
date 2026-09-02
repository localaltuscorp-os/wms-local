"use client";

import { X } from "lucide-react";

// ── Pure helpers (unit-testable; no React/DOM) ──────────────────────────────

/**
 * One explicit installment row in the partial_payment / slabs editor. Amounts
 * are GST-inclusive rupees (entered as strings while editing).
 */
export interface InstallmentRow {
  id: string;
  dueDate: string;
  amount: string;
}

/** Σ of the row amounts in integer paise (float-safe, mirrors the server). */
export function rowsPaise(rows: { amount: string }[]): number {
  return rows.reduce((acc, r) => {
    const n = Number(r.amount);
    return acc + (Number.isFinite(n) ? Math.round(n * 100) : 0);
  }, 0);
}

/** Contract GST-inclusive total in integer paise (mirrors the server). */
export function totalPaise(total: number): number {
  return Math.round((Number.isFinite(total) ? total : 0) * 100);
}

/**
 * Whether the rows editor is in a CONFIRMABLE state: at least one row, every
 * row has a date + positive amount, and Σ amounts === the green total (to the
 * paise). This is exactly what gates the red "Confirm" button.
 */
export function rowsMatchTotal(rows: InstallmentRow[], total: number): boolean {
  if (rows.length === 0) return false;
  for (const r of rows) {
    if (!r.dueDate) return false;
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  return rowsPaise(rows) === totalPaise(total);
}

// ── Rows editor (partial_payment + slabs share this) ────────────────────────

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3 py-2 text-[15px] bg-white";

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/**
 * Due-date / amount / running-balance rows editor used by both Partial Payment
 * and Slabs. The Balance column shows the remaining amount after each row
 * (total − cumulative). Fully controlled by the parent.
 */
export function RowsEditor({
  rows,
  total,
  onChange,
}: {
  rows: InstallmentRow[];
  total: number | null;
  onChange: (rows: InstallmentRow[]) => void;
}) {
  const t = total ?? 0;

  function setRow(id: string, patch: Partial<InstallmentRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }
  function addRow() {
    onChange([
      ...rows,
      { id: crypto.randomUUID(), dueDate: "", amount: "" },
    ]);
  }

  let cumulative = 0;

  return (
    <div className="space-y-2.5">
      <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
        <span>Due date</span>
        <span>Amount (₹)</span>
        <span>Balance</span>
        <span className="w-7" />
      </div>

      {rows.map((r) => {
        const amt = Number(r.amount);
        cumulative += Number.isFinite(amt) ? amt : 0;
        const balance = t - cumulative;
        return (
          <div
            key={r.id}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
          >
            <input
              type="date"
              value={r.dueDate}
              onChange={(e) => setRow(r.id, { dueDate: e.target.value })}
              className={INPUT_CLASS}
              aria-label="Installment due date"
            />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={r.amount}
              onChange={(e) => setRow(r.id, { amount: e.target.value })}
              placeholder="0.00"
              className={INPUT_CLASS}
              aria-label="Installment amount"
            />
            <span className="text-[14px] font-medium text-[#475569] tabular-nums px-1">
              {inrFmt.format(balance)}
            </span>
            <button
              type="button"
              onClick={() => removeRow(r.id)}
              aria-label="Remove row"
              className="justify-self-end shrink-0 rounded p-1.5 text-[#64748B] hover:text-[#A80400]"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[14px] font-medium text-[#0F172A] hover:border-[#94A3B8]"
      >
        + Add Row
      </button>
    </div>
  );
}
