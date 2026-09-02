"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { IndianRupee, Pencil, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  addAdvance,
  deleteAdvance,
  fetchAdvances,
} from "@/app/(admin)/admin/salary-profiles/actions";
import type { SalaryAdvanceRow, SalaryProfileRow } from "@/lib/queries/salary";
import { monthLabel } from "@/lib/salary/period";
import {
  SalaryProfileDialog,
  type RosterOption,
} from "./salary-profile-dialog";

const inr = (n: number) => n.toLocaleString("en-IN");
const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

/** Current month as a "YYYY-MM" string (local). */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SalaryProfileList({
  rows,
  designations,
  entities,
}: {
  rows: SalaryProfileRow[];
  designations: RosterOption[];
  entities: RosterOption[];
}) {
  const [editing, setEditing] = useState<SalaryProfileRow | null>(null);
  const [advancesFor, setAdvancesFor] = useState<SalaryProfileRow | null>(null);

  if (rows.length === 0) {
    return (
      <div
        className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No active employees
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <table className="w-full text-[15px]">
          <thead>
            <tr
              className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <th className="px-5 py-4">Employee</th>
              <th className="px-5 py-4">Designation</th>
              <th className="px-5 py-4">Entity</th>
              <th className="px-5 py-4 text-right tabular-nums">Annual CTC</th>
              <th className="px-5 py-4 text-right tabular-nums">Monthly TDS</th>
              <th className="px-5 py-4 text-center">PT-exempt</th>
              <th className="px-5 py-4">Probation end</th>
              <th className="px-5 py-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.employeeId}
                className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
                style={{ background: i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
              >
                <td className="px-5 py-4">
                  <div className="text-ink-strong font-medium">{r.name}</div>
                  <div className="text-[12px] text-ink-subtle">{r.email}</div>
                </td>
                <td className="px-5 py-4 text-ink-soft">{r.designationName ?? "—"}</td>
                <td className="px-5 py-4 text-ink-soft">{r.payingEntityName ?? "—"}</td>
                <td className="px-5 py-4 text-right tabular-nums text-ink-strong">
                  {r.annualCtc > 0 ? `₹${inr(r.annualCtc)}` : "—"}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                  {r.tdsMonthly > 0 ? `₹${inr(r.tdsMonthly)}` : "—"}
                </td>
                <td className="px-5 py-4 text-center text-ink-soft">
                  {r.ptExempt ? "✓" : "—"}
                </td>
                <td className="px-5 py-4 text-ink-soft tabular-nums">
                  {r.probationEnd ?? "—"}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAdvancesFor(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-[13px] font-medium text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors"
                    >
                      <IndianRupee size={14} strokeWidth={2.2} />
                      Advances
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setEditing(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-[13px] font-medium text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors"
                    >
                      <Pencil size={14} strokeWidth={2.2} />
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SalaryProfileDialog
        row={editing}
        designations={designations}
        entities={entities}
        onClose={() => setEditing(null)}
      />
      <AdvancesDialog row={advancesFor} onClose={() => setAdvancesFor(null)} />
    </>
  );
}

function AdvancesDialog({
  row,
  onClose,
}: {
  row: SalaryProfileRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const [list, setList] = useState<SalaryAdvanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-seed when a different employee opens.
  useEffect(() => {
    if (!row) return;
    setMonth(currentMonth());
    setAmount("");
    setNote("");
    setError(null);
  }, [row]);

  // Load the employee's advances for the chosen month.
  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    setLoading(true);
    fetchAdvances(row.employeeId, month)
      .then((rows) => {
        if (!cancelled) setList(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row, month]);

  function refresh() {
    if (!row) return;
    fetchAdvances(row.employeeId, month).then(setList);
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a positive amount.");

    startTransition(async () => {
      const res = await addAdvance({
        employeeId: row.employeeId,
        month,
        amount: amt,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Advance recorded." });
      setAmount("");
      setNote("");
      refresh();
      router.refresh();
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const res = await deleteAdvance(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Advance deleted." });
      refresh();
      router.refresh();
    });
  }

  const total = list.reduce((s, a) => s + a.amount, 0);

  return (
    <Dialog.Root open={row !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Advances — {row?.name ?? ""}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            Advances apply to a salary month and reduce that month&apos;s net pay.
          </Dialog.Description>

          <div className="space-y-4">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Salary month
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
              {loading ? (
                <p className="text-[14px] text-ink-subtle">Loading…</p>
              ) : list.length === 0 ? (
                <p className="text-[14px] text-ink-subtle">
                  No advances for {monthLabel(month)}.
                </p>
              ) : (
                <ul className="space-y-2">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-white border border-hairline px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold tabular-nums text-ink-strong">
                          ₹{inr(a.amount)}
                        </div>
                        {a.note && (
                          <div className="text-[13px] text-ink-subtle truncate">{a.note}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Delete advance"
                        disabled={pending}
                        onClick={() => onDelete(a.id)}
                        className="inline-flex items-center justify-center size-8 rounded-lg border border-hairline text-ink-soft hover:border-altus-red hover:text-altus-red transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </li>
                  ))}
                  <li className="flex items-center justify-between pt-1 text-[14px] font-semibold text-ink-strong tabular-nums">
                    <span>Total</span>
                    <span>₹{inr(total)}</span>
                  </li>
                </ul>
              )}
            </div>

            <form onSubmit={onAdd} className="space-y-3 border-t border-hairline pt-4">
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <div>
                  <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                    Note
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional"
                    maxLength={300}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
                >
                  {error}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  {pending ? "Saving…" : "Add advance"}
                </button>
              </div>
            </form>
          </div>

          <div className="flex justify-end pt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
