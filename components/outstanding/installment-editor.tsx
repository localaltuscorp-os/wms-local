"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatInr } from "@/lib/format";
import {
  fetchInstallmentsForContract,
  editInstallment,
  addAdhocInstallment,
  deleteInstallment,
} from "@/app/(app)/outstanding/actions";
import type { AdminInstallmentRow } from "@/lib/queries/outstanding";

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-2.5 py-1.5 text-[14px] bg-white";

/**
 * Admin installment editor for a single contract. Lazy-loads the contract's
 * installments when opened, then allows inline edit (overrides the engine
 * row), ad-hoc add, and delete. Override rows are visually marked.
 */
export function InstallmentEditor({
  contractId,
  clientName,
  open,
  onClose,
}: {
  contractId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminInstallmentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startLoad] = useTransition();

  function reload() {
    startLoad(async () => {
      const res = await fetchInstallmentsForContract(contractId);
      if (!res.ok) {
        setLoadError(res.error);
        setRows([]);
        return;
      }
      setLoadError(null);
      setRows(res.rows);
    });
  }

  useEffect(() => {
    if (open) {
      setRows(null);
      setLoadError(null);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contractId]);

  function afterMutate() {
    reload();
    router.refresh();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Installments — {clientName}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            Edit a due date or amount to override the auto-generated schedule.
            Override rows survive a re-materialization; engine rows are
            regenerated whenever the contract is saved.
          </Dialog.Description>

          {loadError && (
            <div
              role="alert"
              className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400] mb-4"
            >
              {loadError}
            </div>
          )}

          {rows === null ? (
            <p className="text-[14px] text-[#94A3B8] py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-[14px] text-[#94A3B8] py-6 text-center">
              No installments yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E2E8F0] mb-4">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[#64748B] font-bold border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <th className="px-3 py-2.5">Period</th>
                    <th className="px-3 py-2.5">Due date</th>
                    <th className="px-3 py-2.5 tabular-nums">Amount</th>
                    <th className="px-3 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <InstallmentRow key={r.id} row={r} onMutate={afterMutate} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AddAdhocRow contractId={contractId} onMutate={afterMutate} />

          <div className="flex justify-end pt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-[#64748B]"
              >
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InstallmentRow({
  row,
  onMutate,
}: {
  row: AdminInstallmentRow;
  onMutate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dueDate, setDueDate] = useState(row.dueDate);
  const [amount, setAmount] = useState(String(row.amount));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDueDate(row.dueDate);
    setAmount(String(row.amount));
  }, [row.dueDate, row.amount]);

  function save() {
    setError(null);
    const patch: { dueDate?: string; amount?: number } = {};
    if (dueDate !== row.dueDate) patch.dueDate = dueDate;
    const amt = Number(amount);
    // Mirror AddAdhocRow's validation: a non-positive / non-finite amount is
    // always rejected by the server, so block it locally for instant feedback.
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (amt !== row.amount) patch.amount = amt;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await editInstallment(row.id, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Installment updated." });
      setEditing(false);
      onMutate();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteInstallment(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Installment deleted." });
      onMutate();
    });
  }

  return (
    <tr className="border-b border-[#E2E8F0] last:border-b-0">
      <td className="px-3 py-2.5 text-[#0F172A]">
        <span className="inline-flex items-center gap-1.5">
          {row.periodIndex === null ? "Ad-hoc" : `#${row.periodIndex + 1}`}
          {row.isOverride && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(168, 85, 247, 0.12)", color: "#7C3AED" }}
            >
              Override
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {editing ? (
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={INPUT_CLASS}
          />
        ) : (
          <span className="text-[#0F172A] tabular-nums">{row.dueDate}</span>
        )}
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        {editing ? (
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={INPUT_CLASS}
          />
        ) : (
          <span className="text-[#0F172A]">{formatInr(row.amount)}</span>
        )}
        {error && <p className="text-[12px] text-[#A80400] mt-1">{error}</p>}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {editing ? (
          <span className="inline-flex gap-1.5">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              aria-label="Save"
              className="inline-flex items-center justify-center size-8 rounded-md text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}
            >
              <Check size={15} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
                setDueDate(row.dueDate);
                setAmount(String(row.amount));
              }}
              disabled={pending}
              aria-label="Cancel"
              className="inline-flex items-center justify-center size-8 rounded-md border border-[#CBD5E1] text-[#64748B] disabled:opacity-50"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          </span>
        ) : (
          <span className="inline-flex gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              aria-label="Edit installment"
              className="inline-flex items-center justify-center size-8 rounded-md border border-[#CBD5E1] text-[#64748B] hover:text-[#0F172A] disabled:opacity-50"
            >
              <Pencil size={15} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete installment"
              className="inline-flex items-center justify-center size-8 rounded-md border border-[#FECACA] text-[#A80400] hover:bg-[#FEF2F2] disabled:opacity-50"
            >
              <Trash2 size={15} strokeWidth={2.2} />
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

function AddAdhocRow({
  contractId,
  onMutate,
}: {
  contractId: string;
  onMutate: () => void;
}) {
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!dueDate) return setError("Pick a due date.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    startTransition(async () => {
      const res = await addAdhocInstallment(contractId, { dueDate, amount: amt });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Ad-hoc installment added." });
      setDueDate("");
      setAmount("");
      onMutate();
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-[#CBD5E1] p-3.5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#64748B] mb-2.5">
        Add ad-hoc installment
      </p>
      <div className="flex items-end gap-2.5 flex-wrap">
        <div>
          <label className="block text-[12px] font-semibold text-[#0F172A] mb-1">
            Due date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[#0F172A] mb-1">
            Amount (₹)
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={INPUT_CLASS}
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md py-2 px-4 text-[14px] font-medium text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          <Plus size={15} strokeWidth={2.4} />
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="text-[13px] text-[#A80400] mt-2">{error}</p>}
    </div>
  );
}
