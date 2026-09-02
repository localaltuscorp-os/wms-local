"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Award, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { createIncentiveRequest } from "@/app/(app)/incentive/actions";
import { INCENTIVE_TYPES, INCENTIVE_TYPE_LABELS, type IncentiveType } from "@/db/enums";
import {
  visibleIncentiveFields,
  type IncentiveField,
} from "@/lib/incentive-fields";

/**
 * "New incentive request" dialog. Renders the per-type fields generically
 * from lib/incentive-fields.ts — the same config the server validates
 * against, so the two can't drift. Brand-tokened + keyboard-first (Radix
 * autofocuses the type picker on open; Esc closes; Enter submits).
 */
export function IncentiveFormDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncentiveType | "">("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setType("");
    setValues({});
    setError(null);
  }

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) {
      setError("Pick an incentive type first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createIncentiveRequest({ type, details: values });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${INCENTIVE_TYPE_LABELS[type]} request submitted.` });
      reset();
      setOpen(false);
    });
  }

  const fields = type ? visibleIncentiveFields(type, values) : [];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="wg-btn wg-sheen inline-flex cursor-pointer items-center gap-2 rounded-full py-2.5 px-5 text-[15px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #E10600, #A80400)",
            boxShadow:
              "0 10px 24px -12px rgba(168,4,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <Award size={17} strokeWidth={2.4} aria-hidden />
          New Request
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="wg-rise fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg overflow-hidden rounded-2xl bg-surface-card max-h-[calc(100dvh-32px)]"
          style={{
            border: "1px solid var(--color-hairline-strong)",
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
          }}
        >
          {/* Brand accent bar */}
          <span
            aria-hidden
            className="block h-1 w-full"
            style={{ background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          />
          <div className="max-h-[calc(100dvh-36px)] overflow-y-auto p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                    color: "var(--color-altus-red-deep)",
                  }}
                  aria-hidden
                >
                  <Award size={20} strokeWidth={2.4} />
                </span>
                <div>
                  <Dialog.Title
                    className="text-ink-strong"
                    style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}
                  >
                    New Incentive Request
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-[14.5px] text-ink-muted" style={{ lineHeight: 1.5 }}>
                    Pick the incentive type — the form adapts to what it needs. An
                    admin reviews and approves each request.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={pending}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Incentive Type" required>
                <Select
                  options={INCENTIVE_TYPES.map((t) => ({
                    value: t,
                    label: INCENTIVE_TYPE_LABELS[t],
                  }))}
                  value={type}
                  onValueChange={(v) => {
                    setType(v as IncentiveType);
                    setValues({});
                  }}
                  placeholder="— Select incentive —"
                  ariaLabel="Incentive type"
                />
              </Field>

              {fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required}>
                  <FieldInput field={f} value={values[f.key] ?? ""} onChange={setValue} />
                </Field>
              ))}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg px-3.5 py-2.5 text-[14px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
                    color: "var(--color-altus-red-deep)",
                  }}
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="bg-surface-card rounded-pill px-4 py-2.5 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={pending || !type}
                  className="rounded-pill py-2.5 px-6 text-[15px] font-bold text-white shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  {pending ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: IncentiveField;
  value: string;
  onChange: (key: string, v: string) => void;
}) {
  const baseClass =
    "w-full rounded-lg border px-3.5 py-2.5 text-[15px] bg-white text-ink-strong transition-colors outline-none border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/15 placeholder:text-ink-subtle";

  if (field.type === "select") {
    return (
      <Select
        options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        value={value}
        onValueChange={(v) => onChange(field.key, v)}
        placeholder="— Select —"
        ariaLabel={field.label}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        maxLength={1000}
        rows={3}
        className={baseClass}
      />
    );
  }
  return (
    <input
      type={field.type === "tel" ? "tel" : field.type}
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      placeholder={field.placeholder}
      maxLength={1000}
      min={field.type === "number" ? 1 : undefined}
      className={baseClass}
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
      <label className="mb-1.5 block text-[14px] font-bold text-ink-strong">
        {label}
        {required && <span className="ml-0.5 text-altus-red">*</span>}
      </label>
      {children}
    </div>
  );
}
