"use client";

import * as React from "react";
import { Plus, Check } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { addProductOption } from "@/app/(app)/forms/actions";
import type { FormFieldDef } from "@/lib/forms/field-types";

const inputClass =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white outline-none focus:border-altus-red/60";

export function Field({
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

export function FieldInput({
  field,
  value,
  onChange,
  productOptions,
  isAdmin,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (key: string, v: string) => void;
  productOptions?: string[];
  isAdmin?: boolean;
}) {
  if (field.type === "product") {
    return (
      <ProductButtons
        value={value}
        onChange={(v) => onChange(field.key, v)}
        options={productOptions ?? []}
        isAdmin={isAdmin}
      />
    );
  }
  if (field.type === "buttons") {
    return (
      <div className="flex flex-wrap gap-2">
        {(field.options ?? []).map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(field.key, active ? "" : o)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold border transition-colors"
              style={
                active
                  ? { background: "var(--color-altus-red)", color: "#fff", borderColor: "var(--color-altus-red)" }
                  : { background: "#fff", color: "var(--color-ink-soft)", borderColor: "var(--color-hairline)" }
              }
            >
              {active && <Check size={13} />}
              {o}
            </button>
          );
        })}
        {(field.options ?? []).length === 0 && (
          <span className="text-[13px] text-ink-muted">No options yet — add some in “Edit form”.</span>
        )}
      </div>
    );
  }
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
        maxLength={2000}
        rows={3}
        className={inputClass}
      />
    );
  }
  return (
    <input
      type={field.type === "tel" ? "tel" : field.type}
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      placeholder={field.placeholder}
      maxLength={2000}
      min={field.type === "number" ? 0 : undefined}
      className={inputClass}
    />
  );
}

/** Product Name MCQ — buttons; admins can add to the live global list inline. */
export function ProductButtons({
  value,
  onChange,
  options,
  isAdmin,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  isAdmin?: boolean;
}) {
  // Locally-added products show instantly; the server list (`options`) catches
  // up on the next render. Merge instead of mirroring props in an effect.
  const [extras, setExtras] = React.useState<string[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pending, start] = React.useTransition();
  const opts = React.useMemo(
    () => [...options, ...extras.filter((e) => !options.includes(e))],
    [options, extras],
  );

  function addNew() {
    const label = draft.trim();
    if (!label) return;
    if (!opts.includes(label)) setExtras((p) => [...p, label]);
    onChange(label);
    setDraft("");
    setAdding(false);
    start(async () => {
      const res = await addProductOption({ label });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(active ? "" : o)}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold border transition-colors"
            style={
              active
                ? { background: "var(--color-altus-red)", color: "#fff", borderColor: "var(--color-altus-red)" }
                : { background: "#fff", color: "var(--color-ink-soft)", borderColor: "var(--color-hairline)" }
            }
          >
            {active && <Check size={13} />}
            {o}
          </button>
        );
      })}
      {isAdmin &&
        (adding ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addNew(); }
                if (e.key === "Escape") { setAdding(false); setDraft(""); }
              }}
              placeholder="New product"
              className="rounded-full border border-hairline px-3 py-1.5 text-[13px] outline-none focus:border-altus-red/60"
            />
            <button type="button" onClick={addNew} disabled={pending}
              className="rounded-full px-3 py-1.5 text-[13px] font-bold text-white" style={{ background: "var(--color-altus-red)" }}>
              Add
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold border border-dashed border-hairline text-ink-soft hover:text-ink-strong"
          >
            <Plus size={13} /> Add
          </button>
        ))}
    </div>
  );
}
