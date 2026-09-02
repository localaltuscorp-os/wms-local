"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Save, IndianRupee } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect } from "@/components/ui/lookup-select";
import { createReferral, updateReferral } from "@/app/(app)/ambassadors/actions";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/ambassadors/stages";
import type { ReferralRow } from "@/lib/queries/ambassadors";

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)] focus-visible:border-[color:var(--color-altus-red)]";

const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

interface Props {
  open: boolean;
  onClose: () => void;
  ambassadors: { id: string; name: string }[];
  products: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  /** When provided, edit this referral instead of creating a new one. */
  initial?: ReferralRow;
  /** Lock the ambassador to this id (the picker is hidden). */
  defaultAmbassadorId?: string;
}

function Field({
  label,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
        {required && <span style={{ color: "var(--color-altus-red)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

export function ReferralDrawer({
  open,
  onClose,
  ambassadors,
  products,
  employees,
  initial,
  defaultAmbassadorId,
}: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  const [ambassadorId, setAmbassadorId] = React.useState<string | null>(
    initial?.ambassadorId ?? defaultAmbassadorId ?? null,
  );
  const [prospectName, setProspectName] = React.useState(initial?.prospectName ?? "");
  const [prospectCompany, setProspectCompany] = React.useState(initial?.prospectCompany ?? "");
  const [prospectPhone, setProspectPhone] = React.useState(initial?.prospectPhone ?? "");
  const [prospectEmail, setProspectEmail] = React.useState(initial?.prospectEmail ?? "");
  const [dealAmount, setDealAmount] = React.useState(
    initial?.dealAmount != null ? String(initial.dealAmount) : "",
  );
  const [productId, setProductId] = React.useState<string | null>(initial?.productId ?? null);
  const [assignedToId, setAssignedToId] = React.useState<string | null>(initial?.assignedToId ?? null);
  const [stage, setStage] = React.useState<Stage>(initial?.stage ?? "received");
  const [receivedOn, setReceivedOn] = React.useState(initial?.receivedOn ?? "");
  const [expectedClose, setExpectedClose] = React.useState(initial?.expectedClose ?? "");
  const [prospectNotes, setProspectNotes] = React.useState(initial?.prospectNotes ?? "");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Re-seed the form whenever a different referral (or a fresh create) opens.
  React.useEffect(() => {
    if (!open) return;
    setAmbassadorId(initial?.ambassadorId ?? defaultAmbassadorId ?? null);
    setProspectName(initial?.prospectName ?? "");
    setProspectCompany(initial?.prospectCompany ?? "");
    setProspectPhone(initial?.prospectPhone ?? "");
    setProspectEmail(initial?.prospectEmail ?? "");
    setDealAmount(initial?.dealAmount != null ? String(initial.dealAmount) : "");
    setProductId(initial?.productId ?? null);
    setAssignedToId(initial?.assignedToId ?? null);
    setStage(initial?.stage ?? "received");
    setReceivedOn(initial?.receivedOn ?? "");
    setExpectedClose(initial?.expectedClose ?? "");
    setProspectNotes(initial?.prospectNotes ?? "");
    setError(null);
    // Autofocus the first text field once the panel paints.
    const t = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, defaultAmbassadorId]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ambassadorId) {
      setError("Pick the ambassador who sent this referral.");
      return;
    }
    if (!prospectName.trim()) {
      nameRef.current?.focus();
      setError("Enter the prospect's name.");
      return;
    }
    const amountNum = dealAmount.trim() === "" ? undefined : Number(dealAmount);
    if (amountNum != null && (!Number.isFinite(amountNum) || amountNum < 0)) {
      setError("Deal amount must be a positive number.");
      return;
    }

    const payload = {
      ambassadorId,
      prospectName: prospectName.trim(),
      prospectCompany: prospectCompany.trim() || undefined,
      prospectPhone: prospectPhone.trim() || undefined,
      prospectEmail: prospectEmail.trim() || undefined,
      prospectNotes: prospectNotes.trim() || undefined,
      receivedOn: receivedOn || undefined,
      assignedToId: assignedToId ?? null,
      productId: productId ?? null,
      dealAmount: amountNum,
      expectedClose: expectedClose || undefined,
      ...(isEdit ? {} : { stage }),
    };

    setSubmitting(true);
    const res = isEdit
      ? await updateReferral(initial!.id, payload)
      : await createReferral(payload);
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: isEdit ? "Referral updated." : "Referral added.", type: "success" });
    onClose();
    router.refresh();
  }

  const lockAmbassador = !!defaultAmbassadorId || isEdit;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={isEdit ? "Edit referral" : "New referral"}>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(15,23,42,0.42)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
      />
      {/* Slide-over panel */}
      <div
        className="amb-drawer absolute right-0 top-0 flex h-full w-full max-w-[540px] flex-col bg-white shadow-2xl max-md:max-w-none"
        style={{ borderLeft: "1px solid var(--color-hairline-strong)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-4 max-md:px-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--color-altus-red-deep)" }}>
              {isEdit ? "Edit referral" : "New referral"}
            </span>
            <h2
              className="text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.1 }}
            >
              {isEdit ? prospectName || "Referral" : "Add a Referral"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={19} strokeWidth={2.4} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 max-md:px-4">
            {!lockAmbassador && (
              <Field label="Ambassador" required>
                <LookupSelect
                  label="ambassador"
                  value={ambassadorId}
                  onChange={setAmbassadorId}
                  options={ambassadors}
                  className={FIELD}
                  placeholder="Who sent this referral?"
                />
              </Field>
            )}

            <Field label="Prospect Name" required htmlFor="amb-prospect">
              <input
                id="amb-prospect"
                ref={nameRef}
                className={FIELD}
                value={prospectName}
                maxLength={200}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Who they referred"
              />
            </Field>

            <Field label="Company" htmlFor="amb-company">
              <input
                id="amb-company"
                className={FIELD}
                value={prospectCompany}
                maxLength={200}
                onChange={(e) => setProspectCompany(e.target.value)}
                placeholder="Prospect's company"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field label="Phone" htmlFor="amb-phone">
                <input
                  id="amb-phone"
                  className={FIELD}
                  value={prospectPhone}
                  maxLength={40}
                  inputMode="tel"
                  onChange={(e) => setProspectPhone(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Email" htmlFor="amb-email">
                <input
                  id="amb-email"
                  type="email"
                  className={FIELD}
                  value={prospectEmail}
                  maxLength={200}
                  onChange={(e) => setProspectEmail(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field label="Deal Amount (₹)" htmlFor="amb-amount">
                <div className="relative">
                  <IndianRupee
                    size={16}
                    strokeWidth={2.4}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
                  />
                  <input
                    id="amb-amount"
                    className={FIELD + " pl-9 tabular-nums"}
                    value={dealAmount}
                    inputMode="decimal"
                    onChange={(e) => setDealAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                  />
                </div>
              </Field>
              <Field label="Product">
                <LookupSelect
                  label="product"
                  value={productId}
                  onChange={setProductId}
                  options={products}
                  className={FIELD}
                  placeholder="Optional"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field label="Assigned To">
                <LookupSelect
                  label="owner"
                  value={assignedToId}
                  onChange={setAssignedToId}
                  options={employees}
                  className={FIELD}
                  placeholder="Defaults to the partner's owner"
                />
              </Field>
              {!isEdit && (
                <Field label="Stage" htmlFor="amb-stage">
                  <select
                    id="amb-stage"
                    className={FIELD + " cursor-pointer"}
                    value={stage}
                    onChange={(e) => setStage(e.target.value as Stage)}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field label="Received On" htmlFor="amb-received">
                <input
                  id="amb-received"
                  type="date"
                  className={FIELD}
                  value={receivedOn}
                  onChange={(e) => setReceivedOn(e.target.value)}
                />
              </Field>
              <Field label="Expected Close" htmlFor="amb-close">
                <input
                  id="amb-close"
                  type="date"
                  className={FIELD}
                  value={expectedClose}
                  onChange={(e) => setExpectedClose(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="amb-notes">
              <textarea
                id="amb-notes"
                className={FIELD + " min-h-[88px] resize-y"}
                value={prospectNotes}
                maxLength={5000}
                onChange={(e) => setProspectNotes(e.target.value)}
                placeholder="Context, fit, next step…"
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="rounded-lg px-4 py-3 text-[14px] font-semibold"
                style={{
                  background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-hairline px-6 py-4 max-md:px-4">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong transition-colors hover:border-hairline-strong"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
              }}
            >
              {submitting ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.4} />}
              {isEdit ? "Save Changes" : "Add Referral"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
