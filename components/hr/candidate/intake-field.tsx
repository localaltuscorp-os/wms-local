"use client";

import * as React from "react";
import { Check, Mic } from "lucide-react";
import type { FormFieldDef } from "@/lib/forms/field-types";
import { isRequiredField } from "@/lib/hr/candidate/intake-schema";
import { LookupSelect } from "@/components/ui/lookup-select";
import { useDictation, type Dictation } from "@/components/hr/candidate/evaluation-v2/use-dictation";

/**
 * Intake-only floating-label field renderer. This is the premium, OPT-IN variant
 * of the shared FieldInput — it lives here (not in lib/forms/field-types /
 * components/forms/form-fields) so the Candidate Interview Form can look
 * jaw-dropping WITHOUT changing the default field look used by every other form
 * in the app.
 *
 * All styling comes from the `.iwf-*` / `.iwc-*` classes injected once by the
 * wizard's <style> block (no framer-motion — pure CSS transitions, reduced-motion
 * respected). Handles: text / number / tel / email / url / date / textarea /
 * select (floating outlined boxes) and buttons / product (inline chip radiogroup).
 *
 * Special controls (auto-Age, Aadhaar-lookup, managed Position, Departments) are
 * rendered by the section step but share the same `.iwf-*` visual language.
 */
export function IntakeField({
  field,
  value,
  onChange,
  autoFocus,
  error,
  options,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (key: string, v: string) => void;
  autoFocus?: boolean;
  error?: boolean;
  /** Override options (e.g. Departments master) for a select field. */
  options?: string[];
}) {
  const reactId = React.useId();
  const id = `iwf-${reactId}`;
  const [focused, setFocused] = React.useState(false);
  // Dictate-to on every free-text field (Sir). Hook is called unconditionally
  // (rules-of-hooks); the mic only RENDERS on text-like fields that support it.
  const dictation = useDictation({ value, onChange: (v) => onChange(field.key, v) });
  const canDictate =
    field.type === "text" ||
    field.type === "textarea" ||
    field.type === "tel" ||
    field.type === "email" ||
    field.type === "url";
  const showMic = canDictate && dictation.supported;

  if (field.type === "buttons" || field.type === "product") {
    return <IntakeChipField field={field} value={value} onChange={onChange} error={error} autoFocus={autoFocus} />;
  }

  const req = isRequiredField(field);
  const opts = options ?? field.options ?? [];
  // Selects & dates carry their own in-box UI (chosen option / date mask), so
  // their label lives permanently on the top border to avoid a collision.
  const alwaysFloat = field.type === "select" || field.type === "date";
  const hasValue = (value ?? "").trim() !== "";
  const float = alwaysFloat || focused || hasValue;
  const isArea = field.type === "textarea";

  const wrapCls = `iwf${isArea ? " iwf--area" : ""}${float ? " is-float" : ""}${error ? " is-error" : ""}${showMic ? " iwf-has-mic" : ""}`;
  const labelEl = (
    <label htmlFor={id} className="iwf-label">
      {field.label}
      {req && <span className="iwf-req" aria-hidden>*</span>}
    </label>
  );

  const common = {
    id,
    // Unique, non-semantic name + autoComplete off so the browser NEVER autofills
    // the person's saved profile (organization / designation / name / email / tel)
    // into these candidate fields. Chrome's heuristic autofill was filling every
    // recognized field with the same saved value — the "fields getting repeated" bug.
    name: id,
    autoComplete: "off",
    value,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    "data-autofocus": autoFocus || undefined,
    className: "iwf-control",
  } as const;

  if (field.type === "select") {
    // Standardised: the professional searchable combobox (same one used across
    // the app), styled to sit inside the floating-label box.
    return (
      <div className={wrapCls}>
        <LookupSelect
          label={field.label.toLowerCase()}
          value={value || null}
          onChange={(v) => onChange(field.key, v ?? "")}
          options={opts.map((o) => ({ id: o, name: o }))}
          placeholder="— Select —"
          className="iwf-control iwf-lookup"
        />
        {labelEl}
      </div>
    );
  }

  if (isArea) {
    return (
      <div className={wrapCls}>
        <textarea
          {...common}
          rows={3}
          maxLength={2000}
          placeholder={field.placeholder ?? " "}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {labelEl}
        {showMic && <FieldMic dictation={dictation} area />}
      </div>
    );
  }

  return (
    <div className={wrapCls}>
      <input
        {...common}
        type={field.type === "tel" ? "tel" : field.type}
        inputMode={field.type === "number" ? "numeric" : undefined}
        min={field.type === "number" ? 0 : undefined}
        maxLength={2000}
        placeholder={field.placeholder ?? " "}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
      {labelEl}
      {showMic && <FieldMic dictation={dictation} />}
    </div>
  );
}

/** The in-field "Dictate" mic — tap to toggle speech-to-text on this field. */
function FieldMic({ dictation, area }: { dictation: Dictation; area?: boolean }) {
  return (
    <button
      type="button"
      onClick={dictation.toggle}
      aria-label={dictation.recording ? "Stop dictation" : "Dictate this field"}
      title={dictation.recording ? "Stop dictation" : "Dictate"}
      className={`iwf-mic${area ? " iwf-mic--area" : ""}${dictation.recording ? " is-rec" : ""}`}
      tabIndex={-1}
    >
      <Mic size={15} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

/**
 * Read-only floating field for computed values (e.g. auto-Age). Always floats,
 * muted surface, not focusable/typable.
 */
export function IntakeReadonlyField({ label, value }: { label: string; value: string }) {
  const reactId = React.useId();
  const id = `iwf-ro-${reactId}`;
  return (
    <div className="iwf is-float is-readonly">
      <input id={id} value={value} readOnly placeholder="—" aria-label={label} className="iwf-control" />
      <label htmlFor={id} className="iwf-label">
        {label}
      </label>
    </div>
  );
}

/**
 * Inline chip radiogroup for buttons/product fields — compact (options sit on one
 * line, wrapping only when needed) and fully keyboard-navigable (roving tabindex,
 * Arrow/Home/End move + select, Space/Enter toggles).
 */
function IntakeChipField({
  field,
  value,
  onChange,
  error,
  autoFocus,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (key: string, v: string) => void;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const opts = field.options ?? [];
  const req = isRequiredField(field);
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIdx = opts.indexOf(value);

  function focusAndSelect(i: number) {
    const n = opts.length;
    if (n === 0) return;
    const idx = ((i % n) + n) % n;
    const opt = opts[idx];
    if (opt != null) onChange(field.key, opt);
    btnRefs.current[idx]?.focus();
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(opts.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`iwc${error ? " is-error" : ""}${field.nowrap ? " iwc-nowrap" : ""}`} role="radiogroup" aria-label={field.label}>
      <span className="iwc-legend">
        {field.label}
        {req && <span className="iwf-req" aria-hidden>*</span>}
      </span>
      <div className="iwc-opts">
        {opts.length === 0 && <span className="text-[13px] text-ink-muted">No options.</span>}
        {opts.map((o, i) => {
          const on = value === o;
          // Roving tabindex: the selected chip is the tab stop; if none selected,
          // the first chip is.
          const isStop = on || (selectedIdx === -1 && i === 0);
          return (
            <button
              key={o}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={isStop ? 0 : -1}
              data-autofocus={autoFocus && i === 0 ? true : undefined}
              onClick={() => onChange(field.key, on ? "" : o)}
              onKeyDown={(e) => onKey(e, i)}
              className={`iwc-chip${on ? " is-on" : ""}`}
            >
              {on && <Check size={13} strokeWidth={3} aria-hidden />}
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
