"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MoreHorizontal, Pencil, ListOrdered, Ban, CheckCircle2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { formatInr } from "@/lib/format";
import {
  updateOutstandingContract,
  writeOffContract,
  closeContract,
} from "@/app/(app)/outstanding/actions";
import {
  OUTSTANDING_CYCLES,
  OUTSTANDING_CYCLE_LABELS,
  GST_RATES,
} from "@/db/enums";
import type { AdminContractRow } from "@/lib/queries/outstanding";
import type { UpdateContractInput } from "@/lib/validators/outstanding";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { InstallmentEditor } from "./installment-editor";

const CYCLE_OPTIONS = OUTSTANDING_CYCLES.map((c) => ({
  value: c,
  label: OUTSTANDING_CYCLE_LABELS[c],
}));

const GST_OPTIONS = GST_RATES.map((r) => ({
  value: String(r),
  label: r === 0 ? "0 — No GST" : `${r}%`,
}));

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const STATUS_BADGE: Record<
  AdminContractRow["status"],
  { label: string; bg: string; color: string }
> = {
  active: { label: "Active", bg: "var(--color-green-bg)", color: "var(--color-green-deep)" },
  closed: { label: "Closed", bg: "rgba(15, 23, 42, 0.06)", color: "var(--color-ink-subtle)" },
  written_off: { label: "Written Off", bg: "rgba(225, 6, 0, 0.10)", color: "#A80400" },
};

interface Lookups {
  products: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  modes: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}

export function ContractList({
  contracts,
  lookups,
}: {
  contracts: AdminContractRow[];
  lookups: Lookups;
}) {
  const [editing, setEditing] = useState<AdminContractRow | null>(null);
  const [installmentsFor, setInstallmentsFor] = useState<AdminContractRow | null>(null);

  if (contracts.length === 0) {
    return (
      <div
        className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No contracts yet
        </p>
        <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
          Create one from the Outstanding dashboard.
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
              <th className="px-5 py-4">Client</th>
              <th className="px-5 py-4">Product</th>
              <th className="px-5 py-4">Cycle</th>
              <th className="px-5 py-4 tabular-nums">Base Amount</th>
              <th className="px-5 py-4 tabular-nums">GST</th>
              <th className="px-5 py-4 tabular-nums">Periods</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c, i) => (
              <ContractRow
                key={c.id}
                contract={c}
                rowIndex={i}
                onEdit={() => setEditing(c)}
                onInstallments={() => setInstallmentsFor(c)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <EditContractDialog
        contract={editing}
        lookups={lookups}
        onClose={() => setEditing(null)}
      />
      {installmentsFor && (
        <InstallmentEditor
          contractId={installmentsFor.id}
          clientName={installmentsFor.clientName}
          open={installmentsFor !== null}
          onClose={() => setInstallmentsFor(null)}
        />
      )}
    </>
  );
}

function ContractRow({
  contract,
  rowIndex,
  onEdit,
  onInstallments,
}: {
  contract: AdminContractRow;
  rowIndex: number;
  onEdit: () => void;
  onInstallments: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"written_off" | "closed" | null>(null);
  const badge = STATUS_BADGE[contract.status];

  function runStatus(kind: "written_off" | "closed") {
    startTransition(async () => {
      const res =
        kind === "written_off"
          ? await writeOffContract(contract.id)
          : await closeContract(contract.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message:
          kind === "written_off"
            ? `${contract.clientName} written off.`
            : `${contract.clientName} closed.`,
      });
      setConfirm(null);
      router.refresh();
    });
  }

  return (
    <>
      <tr
        className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
        style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
      >
        <td className="px-5 py-4 text-ink-strong font-medium whitespace-nowrap">
          {contract.clientName}
        </td>
        <td className="px-5 py-4 text-ink-soft whitespace-nowrap">
          {contract.productName ?? "—"}
        </td>
        <td className="px-5 py-4 text-ink-soft whitespace-nowrap">
          {OUTSTANDING_CYCLE_LABELS[contract.cycle]}
        </td>
        <td className="px-5 py-4 tabular-nums text-ink-soft whitespace-nowrap">
          {formatInr(contract.baseAmount)}
        </td>
        <td className="px-5 py-4 tabular-nums text-ink-soft">{contract.gstRate}%</td>
        <td className="px-5 py-4 tabular-nums text-ink-soft">
          {contract.periods ?? "—"}
        </td>
        <td className="px-5 py-4">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
        </td>
        <td className="px-5 py-4 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Contract actions"
                disabled={pending}
                className="inline-flex items-center justify-center size-9 rounded-lg border border-hairline text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors disabled:opacity-50 data-[state=open]:border-altus-red data-[state=open]:text-altus-red"
              >
                <MoreHorizontal size={18} strokeWidth={2.2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil size={15} strokeWidth={2.2} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onInstallments}>
                <ListOrdered size={15} strokeWidth={2.2} />
                Installments ({contract.installmentCount})
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {contract.status !== "closed" && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setConfirm("closed");
                  }}
                >
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  Close
                </DropdownMenuItem>
              )}
              {contract.status !== "written_off" && (
                <DropdownMenuItem
                  danger
                  onSelect={(e) => {
                    e.preventDefault();
                    setConfirm("written_off");
                  }}
                >
                  <Ban size={15} strokeWidth={2.2} />
                  Write off
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      <ConfirmStatusDialog
        kind={confirm}
        clientName={contract.clientName}
        pending={pending}
        onConfirm={() => confirm && runStatus(confirm)}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

function ConfirmStatusDialog({
  kind,
  clientName,
  pending,
  onConfirm,
  onClose,
}: {
  kind: "written_off" | "closed" | null;
  clientName: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isWriteOff = kind === "written_off";
  return (
    <Dialog.Root open={kind !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            {isWriteOff ? "Write off contract" : "Close contract"}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            {isWriteOff ? (
              <>
                Mark <strong className="text-ink-strong">“{clientName}”</strong> as
                written off. It drops out of the live dashboard and its schedule
                stops being tracked.
              </>
            ) : (
              <>
                Mark <strong className="text-ink-strong">“{clientName}”</strong> as
                closed. The contract is settled and no longer active.
              </>
            )}
          </Dialog.Description>
          <div className="flex justify-end gap-2 pt-2">
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
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              {pending ? "Working…" : isWriteOff ? "Write off" : "Close contract"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditContractDialog({
  contract,
  lookups,
  onClose,
}: {
  contract: AdminContractRow | null;
  lookups: Lookups;
  onClose: () => void;
}) {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [productId, setProductId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [modeId, setModeId] = useState("");
  const [cycle, setCycle] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [gst, setGst] = useState("18");
  const [startDate, setStartDate] = useState("");
  const [periods, setPeriods] = useState("");
  const [pdc, setPdc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!contract) return;
    setClientName(contract.clientName);
    setProductId(contract.productId ?? "");
    setEntityId(contract.entityId ?? "");
    setResponsibleId(contract.responsibleId ?? "");
    setModeId(contract.expectedModeId ?? "");
    setCycle(contract.cycle);
    setBaseAmount(String(contract.baseAmount));
    setGst(String(contract.gstRate));
    setStartDate(contract.startDate);
    setPeriods(contract.periods === null ? "" : String(contract.periods));
    setPdc(contract.pdcReceived ? "yes" : "no");
    setError(null);
  }, [contract]);

  const isFullPayment = cycle === "full_payment";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    setError(null);

    if (!clientName.trim()) return setError("Client is required.");
    const amt = Number(baseAmount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (!cycle) return setError("Pick a cycle.");
    if (!startDate) return setError("Pick a start date.");

    // Build a patch with only the changed fields (the action requires ≥1 key).
    const patch: UpdateContractInput = {};
    if (clientName.trim() !== contract.clientName) patch.clientName = clientName.trim();
    if ((productId || null) !== contract.productId) patch.productId = productId || null;
    if ((entityId || null) !== contract.entityId) patch.entityId = entityId || null;
    if ((responsibleId || null) !== contract.responsibleId)
      patch.responsibleId = responsibleId || null;
    if ((modeId || null) !== contract.expectedModeId)
      patch.expectedModeId = modeId || null;
    if (cycle !== contract.cycle) patch.cycle = cycle as UpdateContractInput["cycle"];
    if (amt !== contract.baseAmount) patch.baseAmount = amt;
    if (Number(gst) !== contract.gstRate) patch.gstRate = Number(gst);
    if (startDate !== contract.startDate) patch.startDate = startDate;
    const nextPeriods = isFullPayment
      ? 1
      : periods.trim()
        ? Number(periods)
        : null;
    if (nextPeriods !== contract.periods) patch.periods = nextPeriods;
    const nextPdc = pdc === "yes";
    if (nextPdc !== contract.pdcReceived) patch.pdcReceived = nextPdc;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateOutstandingContract(contract.id, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Contract updated." });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={contract !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit contract
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            Saving re-materializes the schedule from these fields. Override
            installments are preserved.
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Client" required>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                maxLength={200}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Product">
              <Select
                options={lookups.products.map((p) => ({ value: p.id, label: p.name }))}
                value={productId}
                onValueChange={setProductId}
                placeholder="— Select product —"
                ariaLabel="Product"
              />
            </Field>
            <Field label="Entity">
              <Select
                options={lookups.entities.map((en) => ({ value: en.id, label: en.name }))}
                value={entityId}
                onValueChange={setEntityId}
                placeholder="— Select entity —"
                ariaLabel="Entity"
              />
            </Field>
            <Field label="Responsible person">
              <Select
                options={lookups.employees.map((em) => ({ value: em.id, label: em.name }))}
                value={responsibleId}
                onValueChange={setResponsibleId}
                placeholder="— Select person —"
                searchable
                ariaLabel="Responsible person"
              />
            </Field>
            <Field label="Payment mode">
              <Select
                options={lookups.modes.map((m) => ({ value: m.id, label: m.name }))}
                value={modeId}
                onValueChange={setModeId}
                placeholder="— Select mode —"
                ariaLabel="Payment mode"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base amount (₹)" required>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="GST" required>
                <Select
                  options={GST_OPTIONS}
                  value={gst}
                  onValueChange={setGst}
                  placeholder="— GST —"
                  ariaLabel="GST rate"
                />
              </Field>
            </div>
            <Field label="Cycle" required>
              <Select
                options={CYCLE_OPTIONS}
                value={cycle}
                onValueChange={setCycle}
                placeholder="— Select cycle —"
                ariaLabel="Payment cycle"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={isFullPayment ? "Date" : "Start date"} required>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
              {!isFullPayment && (
                <Field label="# of months (periods)">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={periods}
                    onChange={(e) => setPeriods(e.target.value)}
                    placeholder="Open-ended"
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
            </div>
            <Field label="PDC received" required>
              <Select
                options={YES_NO_OPTIONS}
                value={pdc}
                onValueChange={setPdc}
                placeholder="— Select —"
                ariaLabel="PDC received"
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
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

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
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
