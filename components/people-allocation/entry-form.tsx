"use client";

import * as React from "react";
import { Plus, Trash2, ChevronDown, User, GraduationCap } from "lucide-react";
import {
  ALLOCATION_CATEGORIES,
  INTERN_PRODUCTS,
  HH_CALL_TYPES,
  HH_DAYS,
  HH_BATCHED_SECTIONS,
  HH_PERSON_KINDS,
  hhNamesFor,
} from "@/db/enums";
import { DateField } from "@/components/ui/date-field";

/**
 * The Hand-holding Add form — "Add Employee / Intern".
 *
 * One form, opened from one place: the "+ Add" beside the tabs, each section
 * card's Add, and the "A" shortcut all raise the same dialog, so there is a
 * single layout to learn and a single one to maintain.
 *
 * The kind is chosen FIRST, on a two-button toggle, and the name field then
 * offers that roster alone. The older layout put an Employee field and an Intern
 * field side by side with an OR between them, which asked the reader to resolve
 * an ambiguity the form itself should have settled.
 */

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const RED = "var(--color-altus-red)";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2.5 text-[14px] text-ink-strong outline-none transition placeholder:text-ink-subtle focus:border-transparent focus:ring-2 focus:ring-[#E10600]/40";

const labelCls = "mb-1.5 block text-[12.5px] font-bold text-ink-strong";

export interface EntryDraft {
  /** employee | intern — chosen on the toggle, not inherited from the page. */
  kind: string;
  name: string;
  section: string;
  batchNo: string | null;
  startDate: string | null;
  endDate: string | null;
  calls: { callType: string; day: string; durationMin: number }[];
}

interface CallDraft {
  callType: string;
  day: string;
  durationMin: string;
}

const blankCall = (): CallDraft => ({ callType: "", day: "", durationMin: "" });

/** Label + required marker, above a control. */
function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label}
        {required && <span style={{ color: RED }}> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11.5px] text-ink-subtle">{hint}</span>}
    </label>
  );
}

/** A native select that keeps the app's chevron rather than the OS one. */
function Select({
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder: string;
  options: readonly { code: string; label: string }[];
}) {
  return (
    <span className="relative block">
      <select
        className={`${inputCls} appearance-none pr-9`}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </span>
  );
}

export function EntryForm({
  personKind,
  defaultSection,
  batchOptions,
  pending,
  onSave,
  onCancel,
}: {
  /** employee | intern — the selected person, which limits the product list. */
  personKind: string;
  /** Which product the form opens on. */
  defaultSection: string;
  /** Batch numbers already in use, offered as suggestions. */
  batchOptions: string[];
  pending: boolean;
  onSave: (draft: EntryDraft) => void;
  onCancel: () => void;
}) {
  // Opens on whichever roster raised the form, so the common case is one click
  // shorter, and switching clears the name — a name from the other list would
  // no longer be selectable.
  const [kind, setKind] = React.useState(personKind === "intern" ? "intern" : "employee");
  const [name, setName] = React.useState("");
  const [product, setProduct] = React.useState(defaultSection);
  const [batchNo, setBatchNo] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [weekly, setWeekly] = React.useState<CallDraft[]>([blankCall(), blankCall()]);

  /**
   * Both kinds see all four products. Interns get their own ORDER — Retainer,
   * Eco System, PS, BSS — rather than the employee one.
   */
  const productOptions = (kind === "intern" ? INTERN_PRODUCTS : ALLOCATION_CATEGORIES).map((c) => ({
    code: c.code,
    label: c.short,
  }));

  /** The chosen kind's roster — the only names the name field offers. */
  const nameOptions = hhNamesFor(kind).map((n) => ({ code: n, label: n }));

  /**
   * Batch No. belongs to PS and BSS; for Retainer and Eco System it is absent.
   * Before a product is chosen it stays on screen with its note, so the field's
   * existence is learned before it disappears rather than after.
   */
  const showBatch = !product || HH_BATCHED_SECTIONS.includes(product);

  const callsComplete = weekly.every((c) => c.callType && c.day && c.durationMin !== "");
  const complete = Boolean(name) && Boolean(product) && Boolean(start) && Boolean(end) && callsComplete;

  function patchCall(i: number, patch: Partial<CallDraft>) {
    setWeekly((w) => w.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }

  function submit() {
    if (!complete) return;
    onSave({
      kind,
      name,
      section: product,
      batchNo: showBatch ? batchNo.trim() || null : null,
      startDate: start || null,
      endDate: end || null,
      calls: weekly.map((c) => ({ callType: c.callType, day: c.day, durationMin: Number(c.durationMin || 0) })),
    });
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") submit();
      }}
    >
      {/* Kind first, on two separate buttons — the name field below then offers
          that roster alone, so there is no "either/or" left for the reader. */}
      <div
        className="mb-5 inline-flex rounded-xl p-1"
        role="tablist"
        aria-label="Person kind"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        {HH_PERSON_KINDS.map((k) => {
          const on = kind === k.code;
          const Icon = k.code === "intern" ? GraduationCap : User;
          return (
            <button
              key={k.code}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                if (on) return;
                setKind(k.code);
                // The other roster's names are not on this list, so a carried
                // name would sit behind a field that no longer offers it.
                setName("");
              }}
              className="inline-flex items-center gap-2 rounded-lg px-7 py-2.5 text-[14.5px] font-extrabold tracking-tight transition-colors"
              style={
                on
                  ? {
                      background: `color-mix(in srgb, ${ACCENT} 10%, white)`,
                      color: ACCENT_DEEP,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 45%, transparent)`,
                    }
                  : { color: "var(--color-ink-soft)" }
              }
            >
              <Icon size={16} strokeWidth={2.4} />
              {k.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-x-5 gap-y-4 max-md:grid-cols-1">
        {/* One name field, holding only the selected kind's roster. */}
        <Field label={kind === "intern" ? "Intern Name" : "Employee Name"} required>
          <Select
            value={name}
            onChange={setName}
            ariaLabel={kind === "intern" ? "Intern Name" : "Employee Name"}
            placeholder={kind === "intern" ? "Select intern" : "Select employee"}
            options={nameOptions}
          />
        </Field>

        <Field label="Product Name" required>
          <Select
            value={product}
            onChange={setProduct}
            ariaLabel="Product Name"
            placeholder="Select product"
            options={productOptions}
          />
        </Field>
        {/* Batch No. appears only for PS and BSS; the note says so even when it
            is on screen, so the rule is never a surprise. */}
        {showBatch ? (
          <Field label="Batch No." hint="Batch No. will appear only when PS or BSS is selected.">
            <span className="relative block">
              <input
                className={`${inputCls} pr-9`}
                value={batchNo}
                list="hh-batch-options"
                placeholder="Select batch"
                aria-label="Batch No."
                onChange={(e) => setBatchNo(e.target.value)}
              />
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <datalist id="hh-batch-options">
                {batchOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </span>
          </Field>
        ) : (
          <div className="max-md:hidden" />
        )}

        <Field label="Start Date" required>
          <DateField
            className={inputCls}
            value={start}
            placeholder="Select start date"
            onChange={(e) => setStart(e.target.value)}
            aria-label="Start Date"
          />
        </Field>
        <Field label="End Date" required>
          <DateField
            className={inputCls}
            value={end}
            placeholder="Select end date"
            onChange={(e) => setEnd(e.target.value)}
            aria-label="End Date"
          />
        </Field>
      </div>

      {/* Weekly Call 1 and 2 to begin with, more on demand. */}
      <div className="mt-5 flex flex-col gap-3">
        {weekly.map((c, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <div
              className="px-4 py-2.5 text-[13px] font-extrabold text-ink-strong"
              style={{ background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)" }}
            >
              Weekly Call {i + 1}
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3 p-4 max-md:grid-cols-1">
              <Field label="Type" required>
                <Select
                  value={c.callType}
                  onChange={(v) => patchCall(i, { callType: v })}
                  ariaLabel={`Weekly Call ${i + 1} Type`}
                  placeholder="Select type"
                  options={HH_CALL_TYPES}
                />
              </Field>
              <Field label="Day" required>
                <Select
                  value={c.day}
                  onChange={(v) => patchCall(i, { day: v })}
                  ariaLabel={`Weekly Call ${i + 1} Day`}
                  placeholder="Select day"
                  options={HH_DAYS}
                />
              </Field>
              <Field label="Duration in mins" required>
                <span className="relative block">
                  <input
                    type="number"
                    min="0"
                    className={`${inputCls} pr-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
                    value={c.durationMin}
                    placeholder="Enter duration"
                    aria-label={`Weekly Call ${i + 1} Duration`}
                    onChange={(e) => patchCall(i, { durationMin: e.target.value })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-subtle">
                    mins
                  </span>
                </span>
              </Field>
              {/* The first call stays; the extras can go. */}
              {i > 0 && (
                <button
                  type="button"
                  aria-label={`Remove Weekly Call ${i + 1}`}
                  onClick={() => setWeekly(weekly.filter((_, k) => k !== i))}
                  className="mb-0.5 rounded-xl p-2.5 transition-colors hover:bg-black/5"
                  style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 40%, transparent)`, color: RED }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setWeekly([...weekly, blankCall()])}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13.5px] font-bold transition-colors hover:bg-black/[0.02]"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: ACCENT }}
        >
          <Plus size={15} strokeWidth={2.8} /> Add More Weekly Calls
        </button>
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="wg-btn rounded-xl px-6 py-2.5 text-[13.5px] font-bold"
          style={{
            background: "var(--color-surface-card)",
            color: "var(--color-ink-strong)",
            boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !complete}
          className="wg-btn rounded-xl px-8 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
