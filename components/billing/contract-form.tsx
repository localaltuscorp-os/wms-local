"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, FileSignature, Loader2, Paperclip, Plus, Save, Trash2, X } from "lucide-react";
import { DictateTextarea } from "@/components/billing/dictate-textarea";
import { fireToast } from "@/lib/toast";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE, rupees } from "@/lib/billing/ui";
import {
  CONTRACT_PAYMENT_TYPES,
  CONTRACT_PAYMENT_TYPE_LABELS,
  type ContractBillingFrequency,
  type ContractPaymentType,
} from "@/db/enums";
import {
  CONTRACT_TOTAL_EXCEEDED,
  amt,
  pdcSummary,
  plannedTotal,
  projectRetainer,
  sequenceLabel,
  validateContractPlan,
  type PlanIssue,
} from "@/lib/billing/contracts";
import {
  removeContractAttachmentAction,
  saveContractAction,
  uploadContractAttachmentAction,
} from "@/app/(app)/billing/contracts/actions";
import { CompactSelect } from "@/components/ui/compact-select";

/**
 * CREATE CONTRACT — Billing → Create Contract (and Edit, from a saved one).
 *
 * Sections in the order of the reference sheet: the contract itself, Payment
 * Type with the schedule that type needs, Attach Contract, PDC Received.
 *
 * Each payment type keeps its OWN rows while you switch between them, so
 * trying "Subscription" and going back to "Milestone based" loses nothing;
 * only the rows of the type chosen are sent.
 *
 * The contract-value ceiling is checked here as you type (validateContractPlan)
 * AND again on the server with its own view of what is billed — the warning is
 * a convenience, not the guard.
 */

export interface ContractFormRow {
  key: string;
  id: string | null;
  dueDate: string;
  description: string;
  amount: string;
  /** Saved rows only — what the server says about them. */
  status?: "pending" | "billed" | "stopped";
  live?: boolean;
  docNo?: string | null;
}

export interface ContractFormPdc {
  key: string;
  chequeDate: string;
  chequeNo: string;
  bankName: string;
  amount: string;
  drawerName: string;
}

export interface ContractFormInitial {
  id: string;
  entityId: string;
  customerId: string;
  totalValue: string;
  startDate: string;
  endDate: string;
  billingDate: string;
  paymentType: ContractPaymentType;
  billingFrequency: ContractBillingFrequency | null;
  retainerAmount: string;
  stopWhenComplete: boolean;
  notes: string;
  items: ContractFormRow[];
  pdcs: ContractFormPdc[];
  attachment: { name: string; url: string | null } | null;
  /** Retainer periods already raised — the preview starts after them. */
  billedAmount: number;
  hasBills: boolean;
}

let keySeq = 0;
const newKey = () => `k${++keySeq}-${Date.now().toString(36)}`;

const emptyRow = (description = ""): ContractFormRow => ({
  key: newKey(),
  id: null,
  dueDate: "",
  description,
  amount: "",
});

const emptyPdc = (): ContractFormPdc => ({
  key: newKey(),
  chequeDate: "",
  chequeNo: "",
  bankName: "",
  amount: "",
  drawerName: "",
});

/** Digits and one decimal point, two places at most — the money inputs' filter. */
function moneyInput(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole ?? "";
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";
const MAX_BYTES = 15 * 1024 * 1024;

export function ContractForm({
  entities,
  customers,
  defaultEntityId,
  today,
  initial,
}: {
  entities: { id: string; label: string }[];
  customers: { id: string; name: string; clientCode: string | null }[];
  defaultEntityId: string;
  today: string;
  initial?: ContractFormInitial;
}) {
  const editing = Boolean(initial);
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const [f, setF] = React.useState(() => ({
    entityId: initial?.entityId ?? defaultEntityId,
    customerId: initial?.customerId ?? "",
    totalValue: initial?.totalValue ?? "",
    startDate: initial?.startDate ?? today,
    endDate: initial?.endDate ?? "",
    billingDate: initial?.billingDate ?? today,
    paymentType: (initial?.paymentType ?? "milestone") as ContractPaymentType,
    billingFrequency: (initial?.billingFrequency ?? "monthly") as ContractBillingFrequency,
    retainerAmount: initial?.retainerAmount ?? "",
    stopWhenComplete: initial?.stopWhenComplete ?? true,
    notes: initial?.notes ?? "",
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const initialRowsFor = (t: ContractPaymentType, fallback: () => ContractFormRow[]) =>
    initial?.paymentType === t && initial.items.length ? initial.items : fallback();

  const [milestones, setMilestones] = React.useState<ContractFormRow[]>(() =>
    initialRowsFor("milestone", () => [emptyRow(), emptyRow(), emptyRow(), emptyRow()]),
  );
  const [subscriptions, setSubscriptions] = React.useState<ContractFormRow[]>(() =>
    initialRowsFor("subscription", () => [emptyRow(), emptyRow(), emptyRow()]),
  );
  const [fullPayment, setFullPayment] = React.useState<ContractFormRow>(() =>
    initial?.paymentType === "full_payment" && initial.items[0]
      ? initial.items[0]
      : { ...emptyRow("Full payment"), dueDate: initial?.billingDate ?? today },
  );
  // Full Payment follows the contract value until somebody types over it.
  const [fullTouched, setFullTouched] = React.useState(initial?.paymentType === "full_payment");
  const [pdcs, setPdcs] = React.useState<ContractFormPdc[]>(() => initial?.pdcs ?? []);

  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [existingAttachment, setExistingAttachment] = React.useState(initial?.attachment ?? null);

  /** Open a file that has been PICKED but not uploaded yet, straight from the
   *  bytes the browser is already holding. */
  function viewPickedFile(picked: File) {
    const url = URL.createObjectURL(picked);
    window.open(url, "_blank", "noopener,noreferrer");
    // Long enough for the new tab to have taken the bytes; short enough not to
    // leak the object URL for the life of the page.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  const fileRef = React.useRef<HTMLInputElement>(null);

  const rowsForType: ContractFormRow[] =
    f.paymentType === "milestone"
      ? milestones
      : f.paymentType === "subscription"
        ? subscriptions
        : f.paymentType === "full_payment"
          ? [{ ...fullPayment, amount: fullTouched ? fullPayment.amount : f.totalValue }]
          : [];

  const planItems = rowsForType.map((r) => ({
    amount: r.amount,
    dueDate: r.dueDate || null,
    description: r.description,
    stopped: r.status === "stopped",
    billed: Boolean(r.live),
  }));

  const issues: PlanIssue[] = [
    ...(f.customerId ? [] : [{ field: "customerId", message: "Choose the Client Name" }]),
    ...(f.entityId ? [] : [{ field: "entityId", message: "Choose the Billing Entity" }]),
    ...(f.endDate ? [] : [{ field: "endDate", message: "Choose the End Date" }]),
    ...validateContractPlan({
      totalValue: f.totalValue,
      paymentType: f.paymentType,
      startDate: f.startDate,
      endDate: f.endDate,
      billingDate: f.billingDate,
      billingFrequency: f.billingFrequency,
      retainerAmount: f.retainerAmount,
      items: planItems,
      pdcs,
    }),
  ];
  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;
  // Field errors appear after the first save attempt; the ceiling shows live.
  const shown = (field: string) => (submitted ? issueFor(field) : undefined);

  const total = amt(f.totalValue);
  const scheduled = plannedTotal(planItems);
  const exceeded = f.paymentType !== "retainer" && total > 0 && scheduled > total;
  const pdcTotals = pdcSummary(pdcs);

  const retainerPreview =
    f.paymentType === "retainer" && total > 0 && amt(f.retainerAmount) > 0
      ? projectRetainer({
          totalValue: total,
          billedSoFar: initial?.paymentType === "retainer" ? initial.billedAmount : 0,
          perPeriod: amt(f.retainerAmount),
          frequency: f.billingFrequency,
          billingDate: f.billingDate,
          endDate: f.endDate || null,
          periodsBilled: initial?.paymentType === "retainer" ? initial.items.length : 0,
          max: 240,
        })
      : [];

  function pickFile(next: File | null) {
    setFileError(null);
    if (!next) return setFile(null);
    const ext = (next.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPT.split(",").includes(`.${ext}`)) {
      setFileError("Attach a PDF, Word document or image (PDF, DOC, DOCX, JPG, PNG, WEBP).");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFileError("The contract file must be 15 MB or smaller.");
      return;
    }
    setFile(next);
  }

  async function removeExistingAttachment() {
    if (!initial || !existingAttachment) return;
    if (!window.confirm(`Remove the attached contract "${existingAttachment.name}"?`)) return;
    const r = await removeContractAttachmentAction({ id: initial.id });
    if (!r.ok) return fireToast({ message: r.error, type: "error" });
    setExistingAttachment(null);
    fireToast({ message: "Attachment removed.", type: "success" });
    router.refresh();
  }

  async function save() {
    setSubmitted(true);
    setServerError(null);
    if (issues.length > 0) {
      fireToast({ message: issues[0]!.message, type: "error" });
      return;
    }
    setBusy(true);
    try {
      const r = await saveContractAction({
        id: initial?.id ?? null,
        ...f,
        billingFrequency: f.paymentType === "retainer" ? f.billingFrequency : null,
        retainerAmount: f.paymentType === "retainer" ? f.retainerAmount : "",
        items: rowsForType.map((row) => ({
          id: row.id,
          dueDate: row.dueDate,
          description: row.description,
          amount: row.amount,
        })),
        pdcs: pdcs.map(({ key: _key, ...p }) => p),
      });
      if (!r.ok) {
        setServerError(r.error);
        fireToast({ message: r.error, type: "error" });
        return;
      }
      if (file) {
        const fd = new FormData();
        fd.set("contractId", r.id);
        fd.set("file", file);
        const up = await uploadContractAttachmentAction(fd).catch(() => ({ ok: false as const, error: "Upload failed." }));
        if (!up.ok) {
          fireToast({ message: `Contract saved, but the attachment did not upload: ${up.error}`, type: "error" });
        }
      }
      fireToast({ message: editing ? "Contract updated." : "Contract created.", type: "success" });
      router.push(`/billing/contracts/${r.id}` as Route);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const billColumn = (row: ContractFormRow) =>
    !row.id ? (
      <span className="text-[11.5px] text-ink-muted">{editing ? "New row" : "Raise after save"}</span>
    ) : row.status === "stopped" ? (
      <Chip tone="red">Stopped</Chip>
    ) : row.live ? (
      <Chip tone="green">Billed{row.docNo ? ` · ${row.docNo}` : ""}</Chip>
    ) : (
      <Chip tone="stone">Pending</Chip>
    );

  const scheduleTable = (
    rows: ContractFormRow[],
    setRows: React.Dispatch<React.SetStateAction<ContractFormRow[]>>,
    kind: "milestone" | "subscription",
  ) => {
    const update = (i: number, patch: Partial<ContractFormRow>) =>
      setRows((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                <th className="w-[110px] pb-2 pr-2">{kind === "milestone" ? "Milestone" : "No."}</th>
                <th className="w-[160px] pb-2 pr-2">
                  Due Date{kind === "subscription" ? <Req /> : null}
                </th>
                <th className="pb-2 pr-2">Description</th>
                <th className="w-[170px] pb-2 pr-2">
                  Billing Amount<Req />
                </th>
                <th className="w-[150px] pb-2 pr-2">Bill</th>
                <th className="w-[44px] pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const locked = Boolean(row.live);
                const amountErr = shown(`items.${i}.amount`);
                const dueErr = shown(`items.${i}.dueDate`);
                return (
                  <tr key={row.key} className="align-top">
                    <td className="py-1.5 pr-2">
                      <span
                        className="inline-flex h-10 items-center rounded-chip px-3 text-[12.5px] font-black text-white"
                        style={{ background: `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` }}
                      >
                        {kind === "milestone" ? `Milestone ${i + 1}` : sequenceLabel(i, rows.length)}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => update(i, { dueDate: e.target.value })}
                        className={INPUT + (dueErr ? ERR : "")}
                        aria-label={`Due date, row ${i + 1}`}
                      />
                      <FieldError msg={dueErr} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={row.description}
                        onChange={(e) => update(i, { description: e.target.value })}
                        placeholder={kind === "milestone" ? "What completes this milestone" : "What this instalment covers"}
                        className={INPUT}
                        aria-label={`Description, row ${i + 1}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <MoneyBox
                        value={row.amount}
                        onChange={(v) => update(i, { amount: v })}
                        disabled={locked}
                        invalid={Boolean(amountErr)}
                        label={`Billing amount, row ${i + 1}`}
                      />
                      <FieldError msg={amountErr} />
                    </td>
                    <td className="py-1.5 pr-2 pt-3.5">{billColumn(row)}</td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        disabled={locked}
                        title={locked ? "A bill has been raised for this row" : "Remove this row"}
                        onClick={() => {
                          if (row.id && !window.confirm(`Remove row ${i + 1} from the schedule?`)) return;
                          setRows((p) => p.filter((_, j) => j !== i));
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-chip text-ink-muted disabled:opacity-30"
                        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                        aria-label={`Remove row ${i + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <AddBtn onClick={() => setRows((p) => [...p, emptyRow()])}>
            Add more
          </AddBtn>
          <ScheduleTotal scheduled={scheduled} total={total} exceeded={exceeded} />
        </div>
      </>
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {/* BACK — to the contract being edited, or to All Contracts. */}
      <Link
        href={(initial ? `/billing/contracts/${initial.id}` : "/billing/contracts") as Route}
        className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted hover:text-ink-strong"
      >
        <ArrowLeft size={14} /> {initial ? "Back to the contract" : "All Contracts"}
      </Link>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Billing</p>
      <h1
        className="mt-1 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(24px,2.8vw,34px)",
          letterSpacing: "-0.025em",
        }}
      >
        {editing ? "Edit Contract" : "Create Contract"}
      </h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        Every bill raised under this contract is a tax invoice in Documents. Amounts are before GST.
      </p>

      {/* ── THE CONTRACT ─────────────────────────────────────────── */}
      <Section title="Contract Details" hint="Who it is with, what it is worth and when it runs." accent="#E10600">
        <Grid cols={3}>
          <Field label="Billing Entity" required error={shown("entityId")}>
            <select value={f.entityId} onChange={(e) => set("entityId", e.target.value)} className={INPUT}>
              <option value="">Select entity</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Client Name"
            required
            error={shown("customerId")}
            hint={customers.length === 0 ? "No clients yet — onboard one in New Customer KYC." : undefined}
          >
            <CompactSelect
              value={f.customerId}
              onChange={(v) => set("customerId", v)}
              className={INPUT}
              placeholder="Select client"
              aria-label="Client"
              matchTriggerWidth
              options={customers.map((c) => ({
                value: c.id,
                label: c.clientCode ? `${c.name} (${c.clientCode})` : c.name,
              }))}
            />
          </Field>
          <Field
            label="Total Contract Value"
            required
            error={shown("totalValue")}
            hint={total > 0 ? rupees(total) : "The most that can ever be billed under this contract."}
          >
            <MoneyBox value={f.totalValue} onChange={(v) => set("totalValue", v)} label="Total contract value" invalid={Boolean(shown("totalValue"))} />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Start Date" required>
            <input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className={INPUT} />
          </Field>
          <Field label="End Date" required error={issueFor("endDate") && (submitted || f.endDate) ? issueFor("endDate") : undefined}>
            <input
              type="date"
              value={f.endDate}
              min={f.startDate || undefined}
              onChange={(e) => set("endDate", e.target.value)}
              className={INPUT + (f.endDate && f.endDate < f.startDate ? ERR : "")}
            />
          </Field>
          <Field label="Billing Date" required hint="The first bill's date. Retainer periods count from it.">
            <input type="date" value={f.billingDate} onChange={(e) => set("billingDate", e.target.value)} className={INPUT} />
          </Field>
        </Grid>
      </Section>

      {/* ── PAYMENT TYPE ─────────────────────────────────────────── */}
      <Section title="Payment Type" hint="How the contract value is billed. The schedule below follows your choice." accent="#E10600">
        <div role="radiogroup" aria-label="Payment type" className="mb-4 flex flex-wrap gap-2">
          {CONTRACT_PAYMENT_TYPES.map((t) => {
            const active = f.paymentType === t;
            const locked = Boolean(initial?.hasBills) && initial?.paymentType !== t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={locked}
                title={locked ? "Bills have been raised, so the Payment Type is fixed" : undefined}
                onClick={() => set("paymentType", t)}
                className="inline-flex h-10 items-center rounded-chip px-4 text-[13px] font-bold transition disabled:opacity-40"
                style={
                  active
                    ? { background: `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))`, color: "#fff" }
                    : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" }
                }
              >
                {CONTRACT_PAYMENT_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        {f.paymentType === "retainer" ? (
          <div>
            <Grid cols={3}>
              <Field label="Billing Frequency" required error={shown("billingFrequency")}>
                <div role="radiogroup" className="flex gap-2">
                  {(["monthly", "quarterly"] as const).map((q) => (
                    <label
                      key={q}
                      className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-chip text-[13px] font-bold"
                      style={
                        f.billingFrequency === q
                          ? { boxShadow: `inset 0 0 0 2px ${BILLING_PURPLE}`, color: BILLING_PURPLE_DEEP }
                          : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" }
                      }
                    >
                      <input
                        type="radio"
                        name="billingFrequency"
                        value={q}
                        checked={f.billingFrequency === q}
                        onChange={() => set("billingFrequency", q)}
                        className="sr-only"
                      />
                      {q === "monthly" ? "Monthly" : "Quarterly"}
                    </label>
                  ))}
                </div>
              </Field>
              <Field
                label={f.billingFrequency === "quarterly" ? "Quarterly Billing Amount" : "Monthly Billing Amount"}
                required
                error={issueFor("retainerAmount") && (submitted || amt(f.retainerAmount) > 0) ? issueFor("retainerAmount") : undefined}
              >
                <MoneyBox
                  value={f.retainerAmount}
                  onChange={(v) => set("retainerAmount", v)}
                  label="Retainer billing amount"
                  invalid={Boolean(issueFor("retainerAmount") && (submitted || amt(f.retainerAmount) > 0))}
                />
              </Field>
              <Field label="Stopping rule">
                <label className="flex h-10 cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-strong">
                  <input
                    type="checkbox"
                    checked={f.stopWhenComplete}
                    onChange={(e) => set("stopWhenComplete", e.target.checked)}
                    className="h-4 w-4 accent-[#E10600]"
                  />
                  Stop when Contract Value is completed
                </label>
              </Field>
            </Grid>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              {retainerPreview.length > 0 ? (
                <>
                  {retainerPreview.length} {f.billingFrequency === "quarterly" ? "quarterly" : "monthly"} bill
                  {retainerPreview.length === 1 ? "" : "s"} from {retainerPreview[0]!.dueDate} to{" "}
                  {retainerPreview[retainerPreview.length - 1]!.dueDate}
                  {retainerPreview[retainerPreview.length - 1]!.amount !== amt(f.retainerAmount)
                    ? `, the last one ${rupees(retainerPreview[retainerPreview.length - 1]!.amount)}`
                    : ""}
                  . The bill that would take the total past the Contract Value is cut short, and billing stops there.
                </>
              ) : (
                "Enter the contract value and the billing amount to see the billing run."
              )}{" "}
              Use <strong>Stop Billing</strong> on the saved contract to halt it early.
            </p>
          </div>
        ) : null}

        {f.paymentType === "milestone" ? scheduleTable(milestones, setMilestones, "milestone") : null}
        {f.paymentType === "subscription" ? scheduleTable(subscriptions, setSubscriptions, "subscription") : null}

        {f.paymentType === "full_payment" ? (
          <div>
            <Grid cols={3}>
              <Field label="Due Date">
                <input
                  type="date"
                  value={fullPayment.dueDate}
                  onChange={(e) => setFullPayment((p) => ({ ...p, dueDate: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <Field label="Description">
                <input
                  value={fullPayment.description}
                  onChange={(e) => setFullPayment((p) => ({ ...p, description: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <Field
                label="Billing Amount"
                required
                error={shown("items.0.amount") ?? (exceeded ? CONTRACT_TOTAL_EXCEEDED : undefined)}
                hint={!fullTouched ? "Follows the Total Contract Value." : undefined}
              >
                <MoneyBox
                  value={rowsForType[0]?.amount ?? ""}
                  disabled={Boolean(fullPayment.live)}
                  onChange={(v) => {
                    setFullTouched(true);
                    setFullPayment((p) => ({ ...p, amount: v }));
                  }}
                  label="Full payment billing amount"
                  invalid={exceeded}
                />
              </Field>
            </Grid>
            {fullPayment.id ? <div className="mt-1">{billColumn(fullPayment)}</div> : null}
          </div>
        ) : null}

        {(f.paymentType === "milestone" || f.paymentType === "subscription") && shown("items") && !exceeded ? (
          <FieldError msg={shown("items")} />
        ) : null}
        {!editing ? (
          <p className="mt-3 text-[12px] text-ink-muted">
            <strong>Raise Bill</strong> and <strong>Stop Billing</strong> are on the contract once it is saved.
          </p>
        ) : null}
      </Section>

      {/* ── ATTACH CONTRACT ──────────────────────────────────────── */}
      {/* VIEW WORKS BEFORE THE FILE IS UPLOADED. A picked file has no URL yet —
          it uploads on save — so "View" on it opens an object URL over the
          bytes already in the browser. Without that, the only way to check you
          had attached the right document was to save the contract first and
          come back, which is exactly when a wrong attachment is expensive. The
          URL is revoked on a timer rather than immediately: revoking in the
          same tick cancels the tab that was just opened. */}
      <Section title="Attach Contract" hint="The signed contract. PDF, Word or an image, up to 15 MB." accent="#059669">
        <div className="flex flex-wrap items-center gap-3">
          {existingAttachment && !file ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-chip px-3 text-[13px] font-semibold" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              <Paperclip size={14} />
              {existingAttachment.name}
              {existingAttachment.url ? (
                <a
                  href={existingAttachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold underline-offset-4 hover:underline"
                  style={{ color: BILLING_PURPLE }}
                >
                  <Eye size={13} /> View
                </a>
              ) : null}
              <button type="button" onClick={() => void removeExistingAttachment()} className="text-ink-muted" aria-label="Remove attachment">
                <X size={14} />
              </button>
            </span>
          ) : null}
          {file ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-chip px-3 text-[13px] font-semibold" style={{ boxShadow: `inset 0 0 0 1px ${BILLING_PURPLE}` }}>
              <Paperclip size={14} /> {file.name}
              <span className="text-ink-muted">({(file.size / 1024 / 1024).toFixed(2)} MB · uploads on save)</span>
              <button
                type="button"
                onClick={() => viewPickedFile(file)}
                className="inline-flex items-center gap-1 font-bold"
                style={{ color: BILLING_PURPLE }}
                aria-label={`View ${file.name}`}
              >
                <Eye size={13} /> View
              </button>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-ink-muted"
                aria-label="Remove selected file"
              >
                <X size={14} />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 items-center gap-1.5 rounded-chip px-3 text-[12.5px] font-bold"
            style={{ boxShadow: `inset 0 0 0 1px ${BILLING_PURPLE}`, color: BILLING_PURPLE }}
          >
            <Paperclip size={13} /> {file || existingAttachment ? "Replace file" : "Attach Contract"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <FieldError msg={fileError ?? undefined} />
      </Section>

      {/* ── PDC RECEIVED ─────────────────────────────────────────── */}
      <Section title="PDC Received" hint="Post-dated cheques received with this contract." accent="#EA580C">
        <div className="mb-3 grid max-w-[520px] grid-cols-2 gap-3">
          <Stat label="No. of PDCs" value={String(pdcTotals.count)} />
          <Stat label="Amount of PDCs" value={rupees(pdcTotals.amount)} />
        </div>
        {pdcs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                  <th className="w-[64px] pb-2 pr-2">Sr. No.</th>
                  <th className="w-[160px] pb-2 pr-2">Date</th>
                  <th className="w-[150px] pb-2 pr-2">Cheque No</th>
                  <th className="pb-2 pr-2">Bank Name</th>
                  <th className="w-[160px] pb-2 pr-2">Amt</th>
                  <th className="pb-2 pr-2">Drawer Name</th>
                  <th className="w-[44px] pb-2" />
                </tr>
              </thead>
              <tbody>
                {pdcs.map((p, i) => {
                  const upd = (patch: Partial<ContractFormPdc>) =>
                    setPdcs((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  const amountErr = shown(`pdcs.${i}.amount`);
                  return (
                    <tr key={p.key} className="align-top">
                      <td className="py-1.5 pr-2">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-black text-white" style={{ background: `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` }}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="date" value={p.chequeDate} onChange={(e) => upd({ chequeDate: e.target.value })} className={INPUT} aria-label={`PDC ${i + 1} date`} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          value={p.chequeNo}
                          inputMode="numeric"
                          maxLength={20}
                          onChange={(e) => upd({ chequeNo: e.target.value.replace(/[^\dA-Za-z-]/g, "") })}
                          className={INPUT + " font-mono"}
                          aria-label={`PDC ${i + 1} cheque number`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={p.bankName} onChange={(e) => upd({ bankName: e.target.value })} className={INPUT} aria-label={`PDC ${i + 1} bank name`} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <MoneyBox value={p.amount} onChange={(v) => upd({ amount: v })} label={`PDC ${i + 1} amount`} invalid={Boolean(amountErr)} />
                        <FieldError msg={amountErr} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={p.drawerName} onChange={(e) => upd({ drawerName: e.target.value })} className={INPUT} aria-label={`PDC ${i + 1} drawer name`} />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const filled = p.chequeNo || p.amount || p.bankName || p.drawerName;
                            if (filled && !window.confirm(`Remove PDC ${i + 1}?`)) return;
                            setPdcs((all) => all.filter((_, j) => j !== i));
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-chip text-ink-muted"
                          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                          aria-label={`Remove PDC ${i + 1}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-2 text-[12.5px] text-ink-muted">No PDCs recorded.</p>
        )}
        <div className="mt-2">
          <AddBtn onClick={() => setPdcs((p) => [...p, emptyPdc()])}>Add more</AddBtn>
        </div>
      </Section>

      <Section title="Notes" hint="Anything else about this contract." accent="#64748B">
        <DictateTextarea
          rows={3}
          value={f.notes}
          onChange={(v) => set("notes", v)}
          placeholder="Anything else about this contract"
          className={INPUT + " h-auto py-2"}
        />
      </Section>

      {serverError ? (
        <p className="mt-4 rounded-chip px-3 py-2 text-[13px] font-semibold" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C" }}>
          {serverError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <Link
          href={(initial ? `/billing/contracts/${initial.id}` : "/billing/contracts") as Route}
          className="inline-flex h-11 items-center rounded-chip px-4 text-[13.5px] font-bold text-ink-muted"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-chip px-5 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))` }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : editing ? <Save size={16} /> : <FileSignature size={16} />}
          {editing ? "Save changes" : "Create Contract"}
        </button>
      </div>
    </form>
  );
}

/* ───────────────────────────── pieces ──────────────────────────────────── */

const INPUT =
  "h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13.5px] outline-none focus:border-[color:var(--color-altus-red)] disabled:bg-[rgba(15,23,42,0.04)] disabled:text-ink-muted";
const ERR = " !border-[#DC2626]";

function Req() {
  return <span style={{ color: "#DC2626" }}> *</span>;
}

function MoneyBox({
  value,
  onChange,
  label,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-ink-muted">Rs.</span>
      <input
        value={value}
        inputMode="decimal"
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(moneyInput(e.target.value))}
        placeholder="0.00"
        className={INPUT + " pl-10 text-right tabular-nums" + (invalid ? ERR : "")}
      />
    </div>
  );
}

function ScheduleTotal({ scheduled, total, exceeded }: { scheduled: number; total: number; exceeded: boolean }) {
  return (
    <div className="text-right text-[12.5px]">
      <div className="font-bold tabular-nums text-ink-strong">
        Scheduled {rupees(scheduled)} of {rupees(total)}
        {!exceeded && total > 0 ? (
          <span className="font-semibold text-ink-muted"> · {rupees(Math.max(0, total - scheduled))} unallocated</span>
        ) : null}
      </div>
      {exceeded ? (
        <div className="mt-0.5 font-bold" style={{ color: "#DC2626" }} role="alert">
          {CONTRACT_TOTAL_EXCEEDED} (over by {rupees(scheduled - total)})
        </div>
      ) : null}
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="mt-1 block text-[11.5px] font-semibold" style={{ color: "#DC2626" }}>
      {msg}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] px-4 py-3" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)", background: "white" }}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">{label}</div>
      <div className="mt-0.5 text-[18px] font-black tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
        {value}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "green" | "red" | "stone"; children: React.ReactNode }) {
  const style =
    tone === "green"
      ? { background: "rgba(22,163,74,0.12)", color: "#15803D" }
      : tone === "red"
        ? { background: "rgba(220,38,38,0.1)", color: "#B91C1C" }
        : { background: "rgba(100,116,139,0.12)", color: "#475569" };
  return (
    <span className="inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={style}>
      {children}
    </span>
  );
}

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-[22px] p-5 max-md:p-4" style={{ ...CARD_STYLE, borderLeft: `3px solid ${accent}` }}>
      <h2 className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>
        {title}
      </h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-ink-muted">{hint}</p>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return <div className={`mb-2 grid grid-cols-1 gap-3 ${cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>{children}</div>;
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-[12px] font-bold text-ink-strong">
        {label}
        {required ? <Req /> : null}
      </span>
      {children}
      {error ? <FieldError msg={error} /> : hint ? <span className="mt-1 block text-[11.5px] text-ink-muted">{hint}</span> : null}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[12.5px] font-bold"
      style={{ boxShadow: `inset 0 0 0 1px ${BILLING_PURPLE}`, color: BILLING_PURPLE }}
    >
      <Plus size={13} /> {children}
    </button>
  );
}
