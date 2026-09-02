"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { submitModule } from "@/app/(app)/forms/actions";
import { visibleFields, type FormFieldDef } from "@/lib/forms/field-types";
import { Field, FieldInput } from "./form-fields";

/**
 * Generic "request" dialog for a module (Reimbursement / Reference /
 * Breakthrough). Renders from the resolved (admin-editable) field list and the
 * live Product Name options.
 */
export function DynamicFormDialog({
  module,
  title,
  buttonLabel,
  fields,
  productOptions,
  isAdmin,
}: {
  module: string;
  title: string;
  buttonLabel: string;
  fields: FormFieldDef[];
  productOptions: string[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setValue = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));
  const visible = visibleFields(fields, values);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitModule({ module, fields: values });
      if (!res.ok) { setError(res.error); return; }
      fireToast({ message: `${title} submitted.` });
      setValues({});
      setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setValues({}); setError(null); } }}>
      <Dialog.Trigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          <Plus size={16} strokeWidth={2.6} /> {buttonLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">{title}</Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            Fill the form below. An admin reviews each submission.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            {visible.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                <FieldInput field={f} value={values[f.key] ?? ""} onChange={setValue} productOptions={productOptions} isAdmin={isAdmin} />
              </Field>
            ))}
            {error && (
              <div role="alert" className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="brand-btn px-4 py-2.5 text-[14px] font-medium text-[#64748B]" disabled={pending}>Cancel</button>
              </Dialog.Close>
              <button type="submit" disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
                {pending ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
