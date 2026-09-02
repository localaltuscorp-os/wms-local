"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  createOutstandingContract,
  uploadOutstandingAttachment,
} from "@/app/(app)/outstanding/actions";
import {
  OUTSTANDING_CYCLES,
  OUTSTANDING_CYCLE_LABELS,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_FREQUENCY_LABELS,
  type OutstandingCycle,
  type SubscriptionFrequency,
} from "@/db/enums";
import { AttachmentField } from "./attachment-field";
import {
  RowsEditor,
  rowsMatchTotal,
  type InstallmentRow,
} from "./cycle-fields";

// Live total wants paise precision (an 18% GST total is rarely round), so use a
// local 2-dp formatter rather than lib/format's whole-rupee formatInr.
const totalFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

// iter-2: the New Contract form offers only 0% / 18% GST.
const GST_OPTIONS = [
  { value: "0", label: "0 — No GST" },
  { value: "18", label: "YES — 18%" },
];

const CYCLE_OPTIONS = OUTSTANDING_CYCLES.map((c) => ({
  value: c,
  label: OUTSTANDING_CYCLE_LABELS[c],
}));

const FREQUENCY_OPTIONS = SUBSCRIPTION_FREQUENCIES.map((f) => ({
  value: f,
  label: SUBSCRIPTION_FREQUENCY_LABELS[f],
}));

const BILL_DATE_OPTIONS = [1, 3, 12, 21, 30].map((d) => ({
  value: String(d),
  label: String(d),
}));

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function OutstandingFormDialog({
  responsibles,
  products,
  entities,
  modes,
  trigger,
}: {
  responsibles: { id: string; name: string }[];
  products: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  modes: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Client + amount
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [productId, setProductId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("18");

  // Cycle + confirmation gate
  const [cycle, setCycle] = useState<OutstandingCycle | "">("");
  const [confirmedCycle, setConfirmedCycle] = useState<OutstandingCycle | null>(
    null,
  );

  // full_payment
  const [fullDate, setFullDate] = useState("");

  // monthly_bill
  const [retainerStart, setRetainerStart] = useState("");
  const [retainerEnd, setRetainerEnd] = useState("");
  const [billDate, setBillDate] = useState("");

  // subscription
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [subAmount, setSubAmount] = useState("");
  const [emiCount, setEmiCount] = useState("");
  const [emiStart, setEmiStart] = useState("");
  const [frequency, setFrequency] = useState<SubscriptionFrequency | "">("");

  // partial_payment / slabs
  const [rows, setRows] = useState<InstallmentRow[]>([]);

  // Payment details
  const [entityId, setEntityId] = useState("");
  const [modeId, setModeId] = useState("");
  const [pdc, setPdc] = useState(""); // "yes" | "no"
  const [comments, setComments] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const total = useMemo(() => {
    const a = Number(amount);
    const g = Number(gst);
    if (!Number.isFinite(a) || a <= 0) return null;
    return a * (1 + (Number.isFinite(g) ? g : 0) / 100);
  }, [amount, gst]);

  // Any edit to a cycle field (or the green total the rows must hit) resets a
  // prior confirmation, forcing the user to re-confirm against current values.
  function resetConfirm() {
    setConfirmedCycle(null);
  }

  // Whether the currently-selected cycle's sub-form is in a confirmable state.
  const cycleValid = useMemo(() => {
    switch (cycle) {
      case "full_payment":
        return !!fullDate;
      case "monthly_bill":
        return (
          !!retainerStart &&
          !!retainerEnd &&
          !!billDate &&
          retainerEnd >= retainerStart
        );
      case "subscription": {
        const a = Number(subAmount);
        const n = Number(emiCount);
        return (
          Number.isFinite(a) &&
          a > 0 &&
          Number.isInteger(n) &&
          n > 0 &&
          !!emiStart &&
          !!frequency
        );
      }
      case "partial_payment":
      case "slabs":
        return rowsMatchTotal(rows, total ?? 0);
      default:
        return false;
    }
  }, [
    cycle,
    fullDate,
    retainerStart,
    retainerEnd,
    billDate,
    subAmount,
    emiCount,
    emiStart,
    frequency,
    rows,
    total,
  ]);

  // For partial/slabs the green Total can change (amount/gst) AFTER confirming;
  // if the rows no longer match, drop the confirmation defensively.
  const confirmed = cycle !== "" && confirmedCycle === cycle && cycleValid;

  function reset() {
    setFirstName("");
    setLastName("");
    setContactPhone("");
    setProductId("");
    setResponsibleId("");
    setAmount("");
    setGst("18");
    setCycle("");
    setConfirmedCycle(null);
    setFullDate("");
    setRetainerStart("");
    setRetainerEnd("");
    setBillDate("");
    setSubStart("");
    setSubEnd("");
    setSubAmount("");
    setEmiCount("");
    setEmiStart("");
    setFrequency("");
    setRows([]);
    setEntityId("");
    setModeId("");
    setPdc("");
    setComments("");
    setFile(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) return setError("Enter a first name.");
    if (!lastName.trim()) return setError("Enter a last name.");
    if (!productId) return setError("Pick a product.");
    if (!responsibleId) return setError("Pick a responsible person.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (!cycle) return setError("Pick a payment cycle.");
    if (!confirmed) {
      return setError(`Confirm the ${OUTSTANDING_CYCLE_LABELS[cycle]} details first.`);
    }
    if (!entityId) return setError("Pick an entity.");
    if (!modeId) return setError("Pick a payment mode.");
    if (!pdc) return setError("Select whether a PDC was received.");

    // Base input — common to every cycle.
    const input: Parameters<typeof createOutstandingContract>[0] = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      contactPhone: contactPhone.trim() || undefined,
      productId,
      entityId,
      responsibleId,
      expectedModeId: modeId,
      cycle,
      baseAmount: amt,
      gstRate: Number(gst),
      startDate: "", // filled per-cycle below
      pdcReceived: pdc === "yes",
      comments: comments.trim() || undefined,
    };

    // Cycle-specific fields → the exact server keys.
    switch (cycle) {
      case "full_payment":
        input.startDate = fullDate;
        break;
      case "monthly_bill":
        // monthly_bill drives the schedule off retainer window + bill date; a
        // startDate is still required by the schema, so anchor it on the
        // retainer start.
        input.startDate = retainerStart;
        input.retainerStart = retainerStart;
        input.retainerEnd = retainerEnd;
        input.billDate = Number(billDate);
        break;
      case "subscription":
        input.startDate = emiStart; // EMI start anchors the schedule
        input.baseAmount = Number(subAmount); // per-EMI amount
        input.emiCount = Number(emiCount);
        input.frequency = frequency as SubscriptionFrequency;
        // Start/End are retainer-style context for the record.
        if (subStart) input.retainerStart = subStart;
        if (subEnd) input.retainerEnd = subEnd;
        break;
      case "partial_payment":
      case "slabs": {
        const explicit = rows.map((r) => ({
          dueDate: r.dueDate,
          amount: Number(r.amount),
        }));
        // startDate must be a valid date for the schema; the earliest row works.
        input.startDate = explicit
          .map((r) => r.dueDate)
          .sort()[0] ?? "";
        input.explicitInstallments = explicit;
        break;
      }
    }

    startTransition(async () => {
      const res = await createOutstandingContract(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (file) {
        const fd = new FormData();
        fd.set("ownerType", "contract");
        fd.set("ownerId", res.id);
        fd.set("file", file);
        const up = await uploadOutstandingAttachment(fd);
        if (!up.ok) {
          fireToast({
            message: `Contract saved, but the attachment failed: ${up.error}`,
            type: "error",
          });
        }
      }
      fireToast({ message: "Outstanding contract created." });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const totalLabel = total === null ? "—" : totalFmt.format(total);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            + Outstanding
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New outstanding contract
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Record a receivable. Pick the payment cycle, fill its details, then
            confirm — the schedule is generated automatically.
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Personal Information */}
            <Section title="Personal Information">
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <Field label="First Name" required>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    maxLength={100}
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Last Name" required>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    maxLength={100}
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>
              <Field label="Cell No">
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Optional"
                  maxLength={40}
                  className={INPUT_CLASS}
                />
              </Field>
            </Section>

            {/* Product */}
            <Section title="Product">
              <Field label="Product" required>
                <Select
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                  value={productId}
                  onValueChange={setProductId}
                  placeholder="— Select product —"
                  ariaLabel="Product"
                />
              </Field>
            </Section>

            {/* Responsible */}
            <Section title="Responsible Person">
              <Field label="Responsible person" required>
                <Select
                  options={responsibles.map((r) => ({ value: r.id, label: r.name }))}
                  value={responsibleId}
                  onValueChange={setResponsibleId}
                  placeholder="— Select person —"
                  searchable
                  ariaLabel="Responsible person"
                />
              </Field>
            </Section>

            {/* Amount & GST */}
            <Section title="Amount & GST">
              <Field label="Amount (₹)" required>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    resetConfirm();
                  }}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="GST" required>
                <Select
                  options={GST_OPTIONS}
                  value={gst}
                  onValueChange={(v) => {
                    setGst(v);
                    resetConfirm();
                  }}
                  placeholder="— Select GST —"
                  ariaLabel="GST rate"
                />
              </Field>
              <div className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#166534]">Total</span>
                <span className="text-[16px] font-bold text-[#15803D] tabular-nums">
                  {totalLabel}
                </span>
              </div>
            </Section>

            {/* Payment cycle + sub-form */}
            <Section title="Payment Cycle">
              <Field label="Cycle" required>
                <Select
                  options={CYCLE_OPTIONS}
                  value={cycle}
                  onValueChange={(v) => {
                    setCycle(v as OutstandingCycle);
                    setConfirmedCycle(null);
                  }}
                  placeholder="— Select cycle —"
                  ariaLabel="Payment cycle"
                />
              </Field>

              {cycle && (
                <CycleSubForm
                  cycle={cycle}
                  total={total}
                  totalLabel={totalLabel}
                  confirmed={confirmed}
                  cycleValid={cycleValid}
                  onConfirm={() => cycleValid && setConfirmedCycle(cycle)}
                  // full_payment
                  fullDate={fullDate}
                  setFullDate={(v) => {
                    setFullDate(v);
                    resetConfirm();
                  }}
                  // monthly_bill
                  retainerStart={retainerStart}
                  setRetainerStart={(v) => {
                    setRetainerStart(v);
                    resetConfirm();
                  }}
                  retainerEnd={retainerEnd}
                  setRetainerEnd={(v) => {
                    setRetainerEnd(v);
                    resetConfirm();
                  }}
                  billDate={billDate}
                  setBillDate={(v) => {
                    setBillDate(v);
                    resetConfirm();
                  }}
                  // subscription
                  subStart={subStart}
                  setSubStart={(v) => {
                    setSubStart(v);
                    resetConfirm();
                  }}
                  subEnd={subEnd}
                  setSubEnd={(v) => {
                    setSubEnd(v);
                    resetConfirm();
                  }}
                  subAmount={subAmount}
                  setSubAmount={(v) => {
                    setSubAmount(v);
                    resetConfirm();
                  }}
                  emiCount={emiCount}
                  setEmiCount={(v) => {
                    setEmiCount(v);
                    resetConfirm();
                  }}
                  emiStart={emiStart}
                  setEmiStart={(v) => {
                    setEmiStart(v);
                    resetConfirm();
                  }}
                  frequency={frequency}
                  setFrequency={(v) => {
                    setFrequency(v as SubscriptionFrequency);
                    resetConfirm();
                  }}
                  // partial / slabs
                  rows={rows}
                  setRows={(r) => {
                    setRows(r);
                    resetConfirm();
                  }}
                />
              )}
            </Section>

            {/* Payment details */}
            <Section title="Payment Details">
              <Field label="Entity" required>
                <Select
                  options={entities.map((en) => ({ value: en.id, label: en.name }))}
                  value={entityId}
                  onValueChange={setEntityId}
                  placeholder="— Select entity —"
                  ariaLabel="Entity"
                />
              </Field>
              <Field label="Payment mode" required>
                <Select
                  options={modes.map((m) => ({ value: m.id, label: m.name }))}
                  value={modeId}
                  onValueChange={setModeId}
                  placeholder="— Select mode —"
                  ariaLabel="Payment mode"
                />
              </Field>
              <Field label="PDC received" required>
                <Select
                  options={YES_NO_OPTIONS}
                  value={pdc}
                  onValueChange={setPdc}
                  placeholder="— Select —"
                  ariaLabel="PDC received"
                />
              </Field>
            </Section>

            {/* Additional */}
            <Section title="Additional">
              <Field label="Comments">
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Optional notes"
                  maxLength={1000}
                  rows={3}
                  className={INPUT_CLASS}
                />
              </Field>
              <AttachmentField file={file} onChange={setFile} />
            </Section>

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
                disabled={pending || !confirmed}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Create contract"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Cycle sub-form router ───────────────────────────────────────────────────

interface SubFormProps {
  cycle: OutstandingCycle;
  total: number | null;
  totalLabel: string;
  confirmed: boolean;
  cycleValid: boolean;
  onConfirm: () => void;
  fullDate: string;
  setFullDate: (v: string) => void;
  retainerStart: string;
  setRetainerStart: (v: string) => void;
  retainerEnd: string;
  setRetainerEnd: (v: string) => void;
  billDate: string;
  setBillDate: (v: string) => void;
  subStart: string;
  setSubStart: (v: string) => void;
  subEnd: string;
  setSubEnd: (v: string) => void;
  subAmount: string;
  setSubAmount: (v: string) => void;
  emiCount: string;
  setEmiCount: (v: string) => void;
  emiStart: string;
  setEmiStart: (v: string) => void;
  frequency: SubscriptionFrequency | "";
  setFrequency: (v: string) => void;
  rows: InstallmentRow[];
  setRows: (r: InstallmentRow[]) => void;
}

function CycleSubForm(p: SubFormProps) {
  const label = OUTSTANDING_CYCLE_LABELS[p.cycle];

  let body: React.ReactNode = null;
  switch (p.cycle) {
    case "full_payment":
      body = (
        <>
          <Field label="Date" required>
            <input
              type="date"
              value={p.fullDate}
              onChange={(e) => p.setFullDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <div className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2.5 text-[14px] font-semibold text-[#166534]">
            Total Amount to be paid in full: {p.totalLabel}
          </div>
        </>
      );
      break;
    case "monthly_bill":
      body = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Retainer Start Date" required>
              <input
                type="date"
                value={p.retainerStart}
                onChange={(e) => p.setRetainerStart(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Retainer End Date" required>
              <input
                type="date"
                value={p.retainerEnd}
                onChange={(e) => p.setRetainerEnd(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="Bill Date" required>
            <Select
              options={BILL_DATE_OPTIONS}
              value={p.billDate}
              onValueChange={p.setBillDate}
              placeholder="— Select bill date —"
              ariaLabel="Bill date"
            />
          </Field>
        </div>
      );
      break;
    case "subscription":
      body = (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Start Date">
              <input
                type="date"
                value={p.subStart}
                onChange={(e) => p.setSubStart(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="End Date">
              <input
                type="date"
                value={p.subEnd}
                onChange={(e) => p.setSubEnd(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="Amount (₹)" required>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={p.subAmount}
              onChange={(e) => p.setSubAmount(e.target.value)}
              placeholder="Per-EMI amount"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="No. of EMI" required>
              <input
                type="number"
                min={1}
                step={1}
                value={p.emiCount}
                onChange={(e) => p.setEmiCount(e.target.value)}
                placeholder="e.g. 12"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="EMI Start Date" required>
              <input
                type="date"
                value={p.emiStart}
                onChange={(e) => p.setEmiStart(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="Frequency" required>
            <Select
              options={FREQUENCY_OPTIONS}
              value={p.frequency}
              onValueChange={p.setFrequency}
              placeholder="— Select frequency —"
              ariaLabel="Billing frequency"
            />
          </Field>
        </div>
      );
      break;
    case "partial_payment":
    case "slabs":
      body = (
        <div className="space-y-2">
          <RowsEditor rows={p.rows} total={p.total} onChange={p.setRows} />
          <p className="text-[13px] text-[#64748B]">
            Row amounts must sum to the total {p.totalLabel}.
          </p>
        </div>
      );
      break;
  }

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-3">
      {body}
      <ConfirmButton
        label={`Confirm ${label}`}
        enabled={p.cycleValid}
        confirmed={p.confirmed}
        onClick={p.onConfirm}
      />
    </div>
  );
}

/**
 * Cycle confirmation button. When the sub-form is not yet valid it is PINK and
 * disabled; once valid it turns RED and active. After pressing it (and while
 * the values still match) it shows a confirmed state.
 */
function ConfirmButton({
  label,
  enabled,
  confirmed,
  onClick,
}: {
  label: string;
  enabled: boolean;
  confirmed: boolean;
  onClick: () => void;
}) {
  if (confirmed) {
    return (
      <div className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5 text-center text-[14px] font-semibold text-[#15803D]">
        ✓ {label.replace("Confirm", "Confirmed")}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-disabled={!enabled}
      className="w-full rounded-md py-2.5 px-4 text-[14px] font-semibold text-white transition-colors"
      style={{
        background: enabled
          ? "linear-gradient(135deg, #E10600, #A80400)"
          : "#FBCFE8",
        cursor: enabled ? "pointer" : "not-allowed",
        color: enabled ? "#FFFFFF" : "#9D174D",
      }}
    >
      {label}
    </button>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
        {title}
      </legend>
      {children}
    </fieldset>
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
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
