"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveFormConfig, resetFormConfig } from "@/app/(app)/forms/actions";
import { FIELD_TYPE_LABELS, OPTION_FIELD_TYPES, type FormFieldDef, type FormFieldType } from "@/lib/forms/field-types";

const TYPES = Object.keys(FIELD_TYPE_LABELS) as FormFieldType[];

/**
 * Admin form editor. Add / relabel / reorder / remove fields, toggle required,
 * and edit dropdown options — for any form (module request, module admin, or
 * an incentive form). Saving stores an override; Reset restores the default.
 */
export function FormEditorDialog({
  formKey,
  formName,
  fields,
}: {
  formKey: string;
  formName: string;
  fields: FormFieldDef[];
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<FormFieldDef[]>(fields);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reseed() { setList(fields); setError(null); }

  function update(i: number, patch: Partial<FormFieldDef>) {
    setList((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function move(i: number, dir: -1 | 1) {
    setList((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  function remove(i: number) { setList((prev) => prev.filter((_, idx) => idx !== i)); }
  function add() {
    setList((prev) => [
      ...prev,
      { key: `field_${prev.length + 1}`, label: "New field", type: "text" },
    ]);
  }

  function save() {
    setError(null);
    // Clean options strings before sending.
    const clean = list.map((f) => ({
      ...f,
      options: f.options?.map((o) => o.trim()).filter(Boolean),
    }));
    start(async () => {
      const res = await saveFormConfig({ formKey, fields: clean });
      if (!res.ok) { setError(res.error); return; }
      fireToast({ message: "Form saved." });
      setOpen(false);
    });
  }
  function reset() {
    if (!confirm("Reset this form to its built-in default? Your customisations will be removed.")) return;
    start(async () => {
      const res = await resetFormConfig({ formKey });
      if (!res.ok) { setError(res.error); return; }
      fireToast({ message: "Form reset to default." });
      setOpen(false);
    });
  }

  const lbl = "block text-[11px] font-bold uppercase tracking-wide text-ink-muted mb-1";
  const inp = "w-full rounded-md border border-hairline px-2.5 py-1.5 text-[13px] outline-none focus:border-altus-red/60 bg-white";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) reseed(); }}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-2 text-[13.5px] font-bold text-ink-soft hover:text-ink-strong transition-colors">
          <Pencil size={14} /> Edit form
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">Edit form — {formName}</Dialog.Title>
          <Dialog.Description className="text-[14px] text-[#64748B] mb-4">
            Add, reorder, rename or remove fields. For dropdowns, put one option per line.
          </Dialog.Description>

          <div className="space-y-3">
            {list.map((f, i) => (
              <div key={i} className="rounded-xl border border-hairline p-3 bg-black/[0.015]">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <span className={lbl}>Label</span>
                    <input value={f.label} onChange={(e) => update(i, { label: e.target.value })} className={inp} />
                  </div>
                  <div className="col-span-3">
                    <span className={lbl}>Key</span>
                    <input value={f.key} onChange={(e) => update(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, "_") })} className={inp} />
                  </div>
                  <div className="col-span-3">
                    <span className={lbl}>Type</span>
                    <select value={f.type} onChange={(e) => update(i, { type: e.target.value as FormFieldType })} className={inp}>
                      {TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 flex items-center gap-1 pb-1.5">
                    <label className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-soft">
                      <input type="checkbox" checked={!!f.required} onChange={(e) => update(i, { required: e.target.checked })} />
                      Req
                    </label>
                  </div>
                </div>
                {OPTION_FIELD_TYPES.includes(f.type) && (
                  <div className="mt-2">
                    <span className={lbl}>{f.type === "buttons" ? "Button options (one per line)" : "Options (one per line)"}</span>
                    <textarea
                      value={(f.options ?? []).join("\n")}
                      onChange={(e) => update(i, { options: e.target.value.split("\n") })}
                      rows={3}
                      className={inp}
                    />
                  </div>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <button type="button" onClick={() => move(i, -1)} className="rounded-md p-1.5 text-ink-soft hover:bg-surface-soft"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(i, 1)} className="rounded-md p-1.5 text-ink-soft hover:bg-surface-soft"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => remove(i)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-bold text-[#A80400] hover:bg-[#FEF2F2]"><Trash2 size={13} /> Remove</button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={add} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-hairline px-4 py-2 text-[13px] font-bold text-ink-soft hover:text-ink-strong">
            <Plus size={14} /> Add field
          </button>

          {error && <div role="alert" className="mt-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]">{error}</div>}

          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={save} disabled={pending}
              className="rounded-md py-2.5 px-5 text-[14px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
              {pending ? "Saving…" : "Save form"}
            </button>
            <button type="button" onClick={reset} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline py-2.5 px-4 text-[14px] font-bold text-ink-soft">
              <RotateCcw size={14} /> Reset to default
            </button>
            <Dialog.Close asChild>
              <button type="button" className="ml-auto px-4 py-2.5 text-[14px] font-medium text-[#64748B]" disabled={pending}>Cancel</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
