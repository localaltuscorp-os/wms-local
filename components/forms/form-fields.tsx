"use client";

import * as React from "react";
import { Plus, Check, Mic } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { addProductOption } from "@/app/(app)/forms/actions";
import { useDictation } from "@/components/ui/use-dictation";
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
              className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-bold border transition-colors"
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
          <span className="text-[13px] text-ink-muted">No options yet - add some in “Edit form”.</span>
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
        placeholder="- Select -"
        ariaLabel={field.label}
      />
    );
  }
  if (field.type === "textarea") {
    return <DictatableTextarea field={field} value={value} onChange={onChange} />;
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

/**
 * A paragraph field you can DICTATE into — the reimbursement Notes field, above
 * all, but every module textarea gets it since they all render through here.
 *
 * ── ONE IMPLEMENTATION, NOT A NEW ONE ──────────────────────────────────────
 * `useDictation` (components/ui/use-dictation.ts) already backs the leave
 * reason, the remote-work note, the goal detail and the HR forms. It uses the
 * browser's own Web Speech API — nothing is recorded and no audio is uploaded
 * or stored; only text arrives — and it already handles every failure this
 * field needs to survive: an unsupported browser (the mic is not rendered at
 * all), a denied or missing microphone, an insecure origin, and a lost network,
 * each with its own message.
 *
 * ── IT APPENDS, IT NEVER REPLACES ──────────────────────────────────────────
 * Finalised phrases are appended to whatever is already in the field, with a
 * space inserted only when one is missing, so dictating after typing extends
 * the note instead of overwriting it. Typing and dictating can be mixed freely,
 * and the result stays editable — dictation cannot submit the form, which is
 * why the mic is a `type="button"`.
 */
function DictatableTextarea({
  field,
  value,
  onChange,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (key: string, v: string) => void;
}) {
  const dictation = useDictation({
    value,
    // The same 2000-char ceiling typing is held to, so a long dictation cannot
    // quietly overflow what the field will store.
    onChange: (v) => onChange(field.key, v.slice(0, 2000)),
  });

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          maxLength={2000}
          rows={3}
          /* pr-10 reserves the 40px the app's other dictatable fields do, so a
             long line never runs under the mic. */
          className={`${inputClass}${dictation.supported ? " pr-10" : ""}`}
        />
        {dictation.supported && (
          <button
            type="button"
            onClick={dictation.toggle}
            aria-pressed={dictation.recording}
            aria-label={dictation.recording ? "Stop dictation" : `Dictate ${field.label}`}
            title={dictation.recording ? "Stop dictation" : "Dictate"}
            /* Top-right, not bottom-right: the browser draws the resize grip in
               the bottom corner. Matches the app's other dictatable textareas. */
            className={`absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md transition-colors ${
              dictation.recording
                ? "animate-pulse text-white"
                : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
            }`}
            style={dictation.recording ? { background: "var(--color-altus-red)" } : undefined}
          >
            <Mic size={14} strokeWidth={2.3} aria-hidden />
          </button>
        )}
      </div>
      {dictation.recording && (
        <p className="mt-1 text-[12px] font-bold text-altus-red" aria-live="polite">
          Listening…{" "}
          {dictation.interim && (
            <span className="font-normal italic text-ink-muted">“{dictation.interim}”</span>
          )}
        </p>
      )}
    </div>
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
            className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-bold border transition-colors"
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
              className="rounded-pill border border-hairline px-3 py-1.5 text-[13px] outline-none focus:border-altus-red/60"
            />
            <button type="button" onClick={addNew} disabled={pending}
              className="rounded-pill px-3 py-1.5 text-[13px] font-bold text-white" style={{ background: "var(--color-altus-red)" }}>
              Add
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-surface-card inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-[13px] font-bold border border-solid border-hairline text-ink-soft hover:text-ink-strong"
          >
            <Plus size={13} /> Add
          </button>
        ))}
    </div>
  );
}
