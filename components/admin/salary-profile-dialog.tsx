"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { fireToast } from "@/lib/toast";
import { upsertSalaryProfile } from "@/app/(admin)/admin/salary-profiles/actions";
import type { SalaryProfileRow } from "@/lib/queries/salary";

export interface RosterOption {
  id: string;
  name: string;
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

/**
 * Edit dialog for one employee's salary profile + on-employee fields
 * (designation, paying entity, probation end). Money is collected as plain
 * numbers; the server action writes `.toFixed(2)` strings. Controlled inputs
 * (the house pattern), `null` when the row is closed.
 */
export function SalaryProfileDialog({
  row,
  designations,
  entities,
  onClose,
}: {
  row: SalaryProfileRow | null;
  designations: RosterOption[];
  entities: RosterOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [annualCtc, setAnnualCtc] = useState("");
  const [tdsMonthly, setTdsMonthly] = useState("");
  const [ptExempt, setPtExempt] = useState(false);
  const [designationId, setDesignationId] = useState("");
  const [payingEntityId, setPayingEntityId] = useState("");
  const [probationEnd, setProbationEnd] = useState("");

  // Re-seed the form whenever a different row is opened.
  useEffect(() => {
    if (!row) return;
    setAnnualCtc(row.annualCtc ? String(row.annualCtc) : "");
    setTdsMonthly(row.tdsMonthly ? String(row.tdsMonthly) : "");
    setPtExempt(row.ptExempt);
    setDesignationId(row.designationId ?? "");
    setPayingEntityId(row.payingEntityId ?? "");
    setProbationEnd(row.probationEnd ?? "");
    setError(null);
  }, [row]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setError(null);

    const ctc = Number(annualCtc || 0);
    const tds = Number(tdsMonthly || 0);
    if (!Number.isFinite(ctc) || ctc < 0) return setError("Enter a valid annual CTC.");
    if (!Number.isFinite(tds) || tds < 0) return setError("Enter a valid monthly TDS.");

    startTransition(async () => {
      const res = await upsertSalaryProfile({
        employeeId: row.employeeId,
        annualCtc: ctc,
        tdsMonthly: tds,
        ptExempt,
        designationId: designationId || null,
        payingEntityId: payingEntityId || null,
        probationEnd: probationEnd || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${row.name}'s salary profile saved.` });
      onClose();
      router.refresh();
    });
  }

  const designationOptions = designations.map((d) => ({ value: d.id, label: d.name }));
  const entityOptions = entities.map((en) => ({ value: en.id, label: en.name }));

  return (
    <Dialog.Root open={row !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Salary profile
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            {row?.name ?? ""}
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <Field label="Annual CTC (₹)">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={annualCtc}
                  onChange={(e) => setAnnualCtc(e.target.value)}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Monthly TDS (₹)">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={tdsMonthly}
                  onChange={(e) => setTdsMonthly(e.target.value)}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox checked={ptExempt} onChange={setPtExempt} ariaLabel="PT exempt" />
              <span className="text-[14px] font-medium text-[#0F172A]">
                Professional-tax exempt (skip the ₹200/mo PT)
              </span>
            </label>

            <Field label="Designation">
              <Select
                options={designationOptions}
                value={designationId}
                onValueChange={setDesignationId}
                placeholder="— None —"
                searchable
                ariaLabel="Designation"
              />
            </Field>

            <Field label="Paying entity">
              <Select
                options={entityOptions}
                value={payingEntityId}
                onValueChange={setPayingEntityId}
                placeholder="— None —"
                searchable
                ariaLabel="Paying entity"
              />
            </Field>

            <Field label="Probation end" hint="Leave blank if not on probation.">
              <input
                type="date"
                value={probationEnd}
                onChange={(e) => setProbationEnd(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-[#94A3B8]">{hint}</p>}
    </div>
  );
}
