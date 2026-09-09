"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Receipt, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { submitModule } from "@/app/(app)/forms/actions";
import { visibleFields, type FormFieldDef } from "@/lib/forms/field-types";
import { Field, FieldInput } from "@/components/forms/form-fields";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/** Field types that comfortably share a row in the claim form. */
const HALF_WIDTH = new Set(["number", "date", "select", "email", "tel"]);

/**
 * Premium "Request Reimbursement" dialog — presentation-only re-skin of the
 * generic module request dialog. Renders the SAME resolved (admin-editable)
 * field list through the shared Field/FieldInput primitives and submits via
 * the same `submitModule` action, so behaviour (validation, receipt link,
 * product options, admin inline-add) is unchanged.
 */
export function RbClaimDialog({
  fields,
  productOptions,
  isAdmin,
}: {
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
      const res = await submitModule({ module: "reimbursement", fields: values });
      if (!res.ok) { setError(res.error); return; }
      fireToast({ message: "Reimbursement claim submitted." });
      setValues({});
      setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setValues({}); setError(null); } }}>
      <Dialog.Trigger asChild>
        <button
          className="wg-btn wg-sheen inline-flex items-center gap-1.5 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
            boxShadow: `0 10px 24px -12px color-mix(in srgb, ${GREEN_DEEP} 75%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}
        >
          <Plus size={16} strokeWidth={2.6} /> Request Reimbursement
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] bg-white p-0 max-h-[calc(100dvh-32px)]"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), 0 32px 80px -24px rgba(15,23,42,0.35)",
          }}
        >
          {/* header wash */}
          <div
            className="relative px-7 pt-6 pb-5 max-md:px-5"
            style={{
              background: `radial-gradient(130% 200% at 100% 0%, color-mix(in srgb, ${GREEN} 10%, transparent), transparent 55%)`,
              borderBottom: "1px solid var(--color-hairline)",
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white"
              style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
            >
              <Receipt size={12} strokeWidth={2.6} /> New claim
            </span>
            <Dialog.Title
              className="mt-2.5 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 24,
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
              }}
            >
              Request Reimbursement
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-[14.5px] font-medium text-ink-subtle" style={{ lineHeight: 1.5 }}>
              Raise an expense with its receipt — an admin reviews and settles every claim.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 inline-grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.05] hover:text-ink-strong"
              >
                <X size={17} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} className="px-7 py-6 max-md:px-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 max-sm:grid-cols-1">
              {visible.map((f) => (
                <div key={f.key} className={HALF_WIDTH.has(f.type) ? "col-span-1 max-sm:col-span-1" : "col-span-2 max-sm:col-span-1"}>
                  <Field label={f.label} required={f.required}>
                    <FieldInput field={f} value={values[f.key] ?? ""} onChange={setValue} productOptions={productOptions} isAdmin={isAdmin} />
                  </Field>
                </div>
              ))}
            </div>
            {error && (
              <div role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[14px] font-medium text-[#A80400]">
                {error}
              </div>
            )}
            <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--color-hairline)" }}>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="bg-surface-card rounded-pill px-4 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="wg-btn rounded-pill px-6 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                  boxShadow: `0 10px 24px -12px color-mix(in srgb, ${GREEN_DEEP} 75%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}
              >
                {pending ? "Submitting…" : "Submit Claim"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
