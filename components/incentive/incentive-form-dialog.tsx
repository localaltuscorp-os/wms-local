"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { createIncentiveRequest } from "@/app/(app)/incentive/actions";
import { INCENTIVE_TYPES, INCENTIVE_TYPE_LABELS, type IncentiveType } from "@/db/enums";
import {
  visibleIncentiveFields,
  type IncentiveField,
} from "@/lib/incentive-fields";
import { ProductButtons } from "@/components/forms/form-fields";

/**
 * "New incentive request" dialog. Renders the per-type fields generically
 * from lib/incentive-fields.ts — the same config the server validates
 * against, so the two can't drift.
 */
export function IncentiveFormDialog({
  productOptions = [],
  isAdmin = false,
}: {
  productOptions?: string[];
  isAdmin?: boolean;
} = {}) {
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
          className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          + New request
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New incentive request
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Pick the incentive type — the form adapts to what that incentive
            needs. An admin reviews and approves each request.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Incentive type" required>
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
                {f.type === "product" ? (
                  <ProductButtons
                    value={values[f.key] ?? ""}
                    onChange={(v) => setValue(f.key, v)}
                    options={productOptions}
                    isAdmin={isAdmin}
                  />
                ) : (
                  <FieldInput field={f} value={values[f.key] ?? ""} onChange={setValue} />
                )}
              </Field>
            ))}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
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
                type="submit"
                disabled={pending || !type}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
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
    "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

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
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
